import type {
  ExternalComposerIntakeDeliveryAck,
  ExternalComposerIntakeRequest,
  ExternalComposerIntakeStatus,
  ExternalComposerIntakeStreamEvent,
  ExternalComposerIntakeSubscription,
} from "@t3tools/contracts";
import { randomUUID } from "node:crypto";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

export interface ExternalComposerIntakeShape {
  readonly hasActiveSubscribers: Effect.Effect<boolean>;
  readonly getStatus: Effect.Effect<ExternalComposerIntakeStatus>;
  readonly publish: (
    request: ExternalComposerIntakeRequest,
  ) => Effect.Effect<ExternalComposerIntakePublishResult>;
  readonly updateSubscription: (
    subscription: ExternalComposerIntakeSubscription,
  ) => Effect.Effect<void>;
  readonly ack: (ack: ExternalComposerIntakeDeliveryAck) => Effect.Effect<void>;
  readonly stream: (
    subscription: ExternalComposerIntakeSubscription,
  ) => Stream.Stream<ExternalComposerIntakeStreamEvent>;
}

export class ExternalComposerIntake extends Context.Service<
  ExternalComposerIntake,
  ExternalComposerIntakeShape
>()("t3/externalComposerIntake/ExternalComposerIntake") {}

type SubscriberRecord = ExternalComposerIntakeSubscription & {
  readonly queue: Queue.Queue<ExternalComposerIntakeStreamEvent>;
  readonly registeredAtEpochMs: number;
  readonly lastSeenAtEpochMs: number;
};

export type ExternalComposerSubscriberPriority = {
  readonly subscriberId: string;
  readonly activatedAtEpochMs: number;
  readonly registeredAtEpochMs: number;
  readonly clientKind?: "browser" | "desktop";
};

type PendingDelivery = {
  readonly subscriberId: string;
  readonly deferred: Deferred.Deferred<boolean>;
};

type ExternalComposerIntakePublishFailureReason =
  | "no-active-composer"
  | "delivery-timeout"
  | "delivery-failed";

export type ExternalComposerIntakePublishResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ExternalComposerIntakePublishFailureReason };

const EXTERNAL_COMPOSER_SUBSCRIBER_STALE_AFTER_MS = 15_000;
const EXTERNAL_COMPOSER_DELIVERY_ACK_TIMEOUT = "2 seconds";

export const ExternalComposerIntakeLive = Layer.effect(
  ExternalComposerIntake,
  Effect.gen(function* () {
    const subscribersRef = yield* Ref.make(new Map<string, SubscriberRecord>());
    const pendingDeliveriesRef = yield* Ref.make(new Map<string, PendingDelivery>());
    const registrationSequenceRef = yield* Ref.make(0);

    const publish: ExternalComposerIntakeShape["publish"] = (request) => {
      return Effect.gen(function* () {
        let lastFailureReason: ExternalComposerIntakePublishFailureReason = "no-active-composer";

        for (;;) {
          const now = yield* Clock.currentTimeMillis;
          const subscribers = yield* Ref.get(subscribersRef);
          const subscriber = selectActiveExternalComposerSubscriber(
            [...subscribers.values()].filter((entry) => isDeliverableSubscriber(entry, now)),
          );
          if (!subscriber) {
            return { ok: false, reason: lastFailureReason };
          }

          const deliveryId = randomUUID();
          const deferred = yield* Deferred.make<boolean>();
          const event: ExternalComposerIntakeStreamEvent = {
            version: 1,
            type: "externalComposerIntakeReceived",
            deliveryId,
            subscriberId: subscriber.subscriberId,
            payload: request,
          };

          yield* Ref.update(pendingDeliveriesRef, (pendingDeliveries) => {
            const next = new Map(pendingDeliveries);
            next.set(deliveryId, {
              subscriberId: subscriber.subscriberId,
              deferred,
            });
            return next;
          });

          const offered = yield* Queue.offer(subscriber.queue, event);
          if (!offered) {
            lastFailureReason = "delivery-failed";
            yield* removePendingDelivery(pendingDeliveriesRef, deliveryId);
            yield* removeSubscriberIfQueueMatches(
              subscribersRef,
              subscriber.subscriberId,
              subscriber.queue,
            );
            continue;
          }

          const ack = yield* Deferred.await(deferred).pipe(
            Effect.timeoutOption(EXTERNAL_COMPOSER_DELIVERY_ACK_TIMEOUT),
          );
          yield* removePendingDelivery(pendingDeliveriesRef, deliveryId);
          if (Option.isNone(ack)) {
            lastFailureReason = "delivery-timeout";
            yield* removeSubscriberIfQueueMatches(
              subscribersRef,
              subscriber.subscriberId,
              subscriber.queue,
            );
            continue;
          }

          if (!ack.value) {
            lastFailureReason = "delivery-failed";
            yield* removeSubscriberIfQueueMatches(
              subscribersRef,
              subscriber.subscriberId,
              subscriber.queue,
            );
            continue;
          }

          yield* Effect.logInfo("Annotations composer intake acknowledged", {
            requestId: request.requestId,
            deliveryId,
            subscriberId: subscriber.subscriberId,
            threadId: subscriber.threadId,
            clientKind: subscriber.clientKind ?? "browser",
          });
          return { ok: true };
        }
      });
    };

    const updateSubscription: ExternalComposerIntakeShape["updateSubscription"] = (subscription) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        yield* Ref.update(subscribersRef, (subscribers) => {
          const current = subscribers.get(subscription.subscriberId);
          if (!current) return subscribers;

          const next = new Map(subscribers);
          next.set(subscription.subscriberId, {
            ...current,
            threadId: subscription.threadId,
            threadTitle: subscription.threadTitle ?? null,
            activatedAtEpochMs: subscription.activatedAtEpochMs,
            lastSeenAtEpochMs: now,
          });
          return next;
        });
      });

    const ack: ExternalComposerIntakeShape["ack"] = (deliveryAck) =>
      Effect.gen(function* () {
        const pendingDelivery = yield* Ref.get(pendingDeliveriesRef).pipe(
          Effect.map((pendingDeliveries) => pendingDeliveries.get(deliveryAck.deliveryId)),
        );
        if (!pendingDelivery || pendingDelivery.subscriberId !== deliveryAck.subscriberId) {
          return;
        }

        yield* Deferred.succeed(pendingDelivery.deferred, deliveryAck.ok).pipe(Effect.asVoid);
      });

    const stream: ExternalComposerIntakeShape["stream"] = (subscription) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const queue = yield* Queue.unbounded<ExternalComposerIntakeStreamEvent>();
          const registeredAtEpochMs = yield* Ref.updateAndGet(
            registrationSequenceRef,
            (sequence) => sequence + 1,
          );
          const now = yield* Clock.currentTimeMillis;
          const record: SubscriberRecord = {
            ...subscription,
            queue,
            registeredAtEpochMs,
            lastSeenAtEpochMs: now,
          };

          const replaced = yield* Ref.modify(subscribersRef, (subscribers) => {
            const next = new Map(subscribers);
            const previous = next.get(subscription.subscriberId);
            next.set(subscription.subscriberId, record);
            return [previous, next];
          });
          if (replaced && replaced.queue !== queue) {
            yield* Queue.shutdown(replaced.queue);
          }

          return Stream.fromQueue(queue).pipe(
            Stream.ensuring(
              Ref.update(subscribersRef, (subscribers) => {
                const next = new Map(subscribers);
                const current = next.get(subscription.subscriberId);
                if (current?.queue === queue) {
                  next.delete(subscription.subscriberId);
                }
                return next;
              }).pipe(Effect.asVoid),
            ),
          );
        }),
      );

    return ExternalComposerIntake.of({
      hasActiveSubscribers: Clock.currentTimeMillis.pipe(
        Effect.flatMap((now) =>
          Ref.get(subscribersRef).pipe(
            Effect.map((subscribers) => {
              return [...subscribers.values()].some((subscriber) =>
                isDeliverableSubscriber(subscriber, now),
              );
            }),
          ),
        ),
      ),
      getStatus: Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const subscribers = yield* Ref.get(subscribersRef);
        const subscriber = selectActiveExternalComposerSubscriber(
          [...subscribers.values()].filter((entry) => isDeliverableSubscriber(entry, now)),
        );

        if (!subscriber) {
          return {
            ok: true,
            connected: false,
            reason: "composer-not-connected",
            checkedAtEpochMs: now,
            target: null,
          } satisfies ExternalComposerIntakeStatus;
        }
        const threadId = subscriber.threadId;
        if (threadId === null) {
          return {
            ok: true,
            connected: false,
            reason: "composer-not-connected",
            checkedAtEpochMs: now,
            target: null,
          } satisfies ExternalComposerIntakeStatus;
        }

        return {
          ok: true,
          connected: true,
          reason: null,
          checkedAtEpochMs: now,
          target: {
            subscriberId: subscriber.subscriberId,
            threadId,
            threadTitle: subscriber.threadTitle ?? null,
            clientKind: subscriber.clientKind ?? "browser",
            activatedAtEpochMs: subscriber.activatedAtEpochMs,
            lastSeenAtEpochMs: subscriber.lastSeenAtEpochMs,
          },
        } satisfies ExternalComposerIntakeStatus;
      }),
      updateSubscription,
      ack,
      publish,
      stream,
    });
  }),
);

export function selectActiveExternalComposerSubscriber<
  TSubscriber extends ExternalComposerSubscriberPriority,
>(subscribers: Iterable<TSubscriber>): TSubscriber | null {
  let selected: TSubscriber | null = null;

  for (const subscriber of subscribers) {
    if (!selected || compareSubscriberPriority(subscriber, selected) > 0) {
      selected = subscriber;
    }
  }

  return selected;
}

function isDeliverableSubscriber(subscriber: SubscriberRecord, now: number): boolean {
  return (
    subscriber.threadId !== null &&
    now - subscriber.lastSeenAtEpochMs <= EXTERNAL_COMPOSER_SUBSCRIBER_STALE_AFTER_MS
  );
}

function removePendingDelivery(
  pendingDeliveriesRef: Ref.Ref<Map<string, PendingDelivery>>,
  deliveryId: string,
): Effect.Effect<void> {
  return Ref.update(pendingDeliveriesRef, (pendingDeliveries) => {
    if (!pendingDeliveries.has(deliveryId)) return pendingDeliveries;
    const next = new Map(pendingDeliveries);
    next.delete(deliveryId);
    return next;
  }).pipe(Effect.asVoid);
}

function removeSubscriberIfQueueMatches(
  subscribersRef: Ref.Ref<Map<string, SubscriberRecord>>,
  subscriberId: string,
  queue: Queue.Queue<ExternalComposerIntakeStreamEvent>,
): Effect.Effect<void> {
  return Ref.update(subscribersRef, (subscribers) => {
    const currentSubscriber = subscribers.get(subscriberId);
    if (currentSubscriber?.queue !== queue) {
      return subscribers;
    }

    const nextSubscribers = new Map(subscribers);
    nextSubscribers.delete(subscriberId);
    return nextSubscribers;
  }).pipe(Effect.asVoid);
}

function compareSubscriberPriority(
  left: ExternalComposerSubscriberPriority,
  right: ExternalComposerSubscriberPriority,
): number {
  const clientKindDelta =
    clientKindPriority(left.clientKind) - clientKindPriority(right.clientKind);
  if (clientKindDelta !== 0) return clientKindDelta;

  const activatedDelta = left.activatedAtEpochMs - right.activatedAtEpochMs;
  if (activatedDelta !== 0) return activatedDelta;

  const registeredDelta = left.registeredAtEpochMs - right.registeredAtEpochMs;
  if (registeredDelta !== 0) return registeredDelta;

  return left.subscriberId.localeCompare(right.subscriberId);
}

function clientKindPriority(clientKind: ExternalComposerSubscriberPriority["clientKind"]): number {
  return clientKind === "desktop" ? 1 : 0;
}
