import * as Effect from "effect/Effect";
import * as Scope from "effect/Scope";

export const scopedSafeTeardown =
  (label: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, Scope.Scope>> =>
    Effect.acquireUseRelease(
      Scope.make(),
      (scope) => effect.pipe(Effect.provideService(Scope.Scope, scope)),
      (scope, exit) =>
        Scope.close(scope, exit).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning(`${label} teardown errored; preserving body result`, cause),
          ),
        ),
    ) as Effect.Effect<A, E, Exclude<R, Scope.Scope>>;
