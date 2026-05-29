import type {
  PointNShootComposerIntakeDeliveryAck,
  PointNShootComposerIntakeRequest,
  PointNShootComposerIntakeStreamEvent,
  PointNShootComposerIntakeSubscription,
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

export interface PointNShootComposerIntakeShape {
  readonly hasActiveSubscribers: Effect.Effect<boolean>;
  readonly publish: (request: PointNShootComposerIntakeRequest) => Effect.Effect<boolean>;
  readonly updateSubscription: (
    subscription: PointNShootComposerIntakeSubscription,
  ) => Effect.Effect<void>;
  readonly ack: (ack: PointNShootComposerIntakeDeliveryAck) => Effect.Effect<void>;
  readonly stream: (
    subscription: PointNShootComposerIntakeSubscription,
  ) => Stream.Stream<PointNShootComposerIntakeStreamEvent>;
}

export class PointNShootComposerIntake extends Context.Service<
  PointNShootComposerIntake,
  PointNShootComposerIntakeShape
>()("t3/pointNShoot/PointNShootComposerIntake") {}

type SubscriberRecord = PointNShootComposerIntakeSubscription & {
  readonly queue: Queue.Queue<PointNShootComposerIntakeStreamEvent>;
  readonly registeredAtEpochMs: number;
  readonly lastSeenAtEpochMs: number;
};

export type PointNShootSubscriberPriority = {
  readonly subscriberId: string;
  readonly activatedAtEpochMs: number;
  readonly registeredAtEpochMs: number;
  readonly clientKind?: "browser" | "desktop";
};

type PendingDelivery = {
  readonly subscriberId: string;
  readonly deferred: Deferred.Deferred<boolean>;
};

const POINTNSHOOT_SUBSCRIBER_STALE_AFTER_MS = 15_000;
const POINTNSHOOT_DELIVERY_ACK_TIMEOUT = "2 seconds";

export const PointNShootComposerIntakeLive = Layer.effect(
  PointNShootComposerIntake,
  Effect.gen(function* () {
    const subscribersRef = yield* Ref.make(new Map<string, SubscriberRecord>());
    const pendingDeliveriesRef = yield* Ref.make(new Map<string, PendingDelivery>());
    const registrationSequenceRef = yield* Ref.make(0);

    const publish: PointNShootComposerIntakeShape["publish"] = (request) => {
      return Effect.gen(function* () {
        for (;;) {
          const now = yield* Clock.currentTimeMillis;
          const subscribers = yield* Ref.get(subscribersRef);
          const subscriber = selectActivePointNShootSubscriber(
            [...subscribers.values()].filter((entry) => isDeliverableSubscriber(entry, now)),
          );
          if (!subscriber) return false;

          const deliveryId = randomUUID();
          const deferred = yield* Deferred.make<boolean>();
          const event: PointNShootComposerIntakeStreamEvent = {
            version: 1,
            type: "composerIntakeReceived",
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
            yield* removePendingDelivery(pendingDeliveriesRef, deliveryId);
            yield* removeSubscriberIfQueueMatches(
              subscribersRef,
              subscriber.subscriberId,
              subscriber.queue,
            );
            continue;
          }

          const acked = yield* Deferred.await(deferred).pipe(
            Effect.timeoutOption(POINTNSHOOT_DELIVERY_ACK_TIMEOUT),
            Effect.map((ack) => Option.getOrElse(ack, () => false)),
          );
          yield* removePendingDelivery(pendingDeliveriesRef, deliveryId);
          if (acked) {
            yield* Effect.logInfo("PointNShoot composer intake acknowledged", {
              requestId: request.requestId,
              deliveryId,
              subscriberId: subscriber.subscriberId,
              threadId: subscriber.threadId,
              clientKind: subscriber.clientKind ?? "browser",
            });
            return true;
          }

          yield* removeSubscriberIfQueueMatches(
            subscribersRef,
            subscriber.subscriberId,
            subscriber.queue,
          );
        }
      });
    };

    const updateSubscription: PointNShootComposerIntakeShape["updateSubscription"] = (
      subscription,
    ) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        yield* Ref.update(subscribersRef, (subscribers) => {
          const current = subscribers.get(subscription.subscriberId);
          if (!current) return subscribers;

          const next = new Map(subscribers);
          next.set(subscription.subscriberId, {
            ...current,
            threadId: subscription.threadId,
            activatedAtEpochMs: subscription.activatedAtEpochMs,
            lastSeenAtEpochMs: now,
          });
          return next;
        });
      });

    const ack: PointNShootComposerIntakeShape["ack"] = (deliveryAck) =>
      Effect.gen(function* () {
        const pendingDelivery = yield* Ref.get(pendingDeliveriesRef).pipe(
          Effect.map((pendingDeliveries) => pendingDeliveries.get(deliveryAck.deliveryId)),
        );
        if (!pendingDelivery || pendingDelivery.subscriberId !== deliveryAck.subscriberId) {
          return;
        }

        yield* Deferred.succeed(pendingDelivery.deferred, deliveryAck.ok).pipe(Effect.asVoid);
      });

    const stream: PointNShootComposerIntakeShape["stream"] = (subscription) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const queue = yield* Queue.unbounded<PointNShootComposerIntakeStreamEvent>();
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

    return PointNShootComposerIntake.of({
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
      updateSubscription,
      ack,
      publish,
      stream,
    });
  }),
);

export function selectActivePointNShootSubscriber<
  TSubscriber extends PointNShootSubscriberPriority,
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
    now - subscriber.lastSeenAtEpochMs <= POINTNSHOOT_SUBSCRIBER_STALE_AFTER_MS
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
  queue: Queue.Queue<PointNShootComposerIntakeStreamEvent>,
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
  left: PointNShootSubscriberPriority,
  right: PointNShootSubscriberPriority,
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

function clientKindPriority(clientKind: PointNShootSubscriberPriority["clientKind"]): number {
  return clientKind === "desktop" ? 1 : 0;
}
