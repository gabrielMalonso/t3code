import type {
  PointNShootComposerIntakeRequest,
  PointNShootComposerIntakeStreamEvent,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

export interface PointNShootComposerIntakeShape {
  readonly hasActiveSubscribers: Effect.Effect<boolean>;
  readonly publish: (request: PointNShootComposerIntakeRequest) => Effect.Effect<void>;
  readonly stream: Stream.Stream<PointNShootComposerIntakeStreamEvent>;
}

export class PointNShootComposerIntake extends Context.Service<
  PointNShootComposerIntake,
  PointNShootComposerIntakeShape
>()("t3/pointNShoot/PointNShootComposerIntake") {}

export const PointNShootComposerIntakeLive = Layer.effect(
  PointNShootComposerIntake,
  Effect.gen(function* () {
    const pubsub = yield* Effect.acquireRelease(
      PubSub.unbounded<PointNShootComposerIntakeStreamEvent>(),
      (queue) => PubSub.shutdown(queue),
    );
    const subscriberCountRef = yield* Ref.make(0);

    const publish: PointNShootComposerIntakeShape["publish"] = (request) => {
      const event: PointNShootComposerIntakeStreamEvent = {
        version: 1,
        type: "composerIntakeReceived",
        payload: request,
      };
      return PubSub.publish(pubsub, event).pipe(Effect.asVoid);
    };

    const stream = Stream.unwrap(
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(pubsub);
        yield* Ref.update(subscriberCountRef, (count) => count + 1);
        return Stream.fromSubscription(subscription).pipe(
          Stream.ensuring(
            Ref.update(subscriberCountRef, (count) => Math.max(0, count - 1)).pipe(Effect.asVoid),
          ),
        );
      }),
    );

    return PointNShootComposerIntake.of({
      hasActiveSubscribers: Ref.get(subscriberCountRef).pipe(Effect.map((count) => count > 0)),
      publish,
      stream,
    });
  }),
);
