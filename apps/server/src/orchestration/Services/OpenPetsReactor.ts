import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface OpenPetsReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drain: Effect.Effect<void>;
}

export class OpenPetsReactor extends Context.Service<OpenPetsReactor, OpenPetsReactorShape>()(
  "t3/orchestration/Services/OpenPetsReactor",
) {}
