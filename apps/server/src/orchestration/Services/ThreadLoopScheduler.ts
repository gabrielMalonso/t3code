/**
 * ThreadLoopScheduler - Server-side scheduler for per-thread loops.
 *
 * Drives persisted loop state and dispatches loop-backed thread turns when a
 * thread becomes due.
 *
 * @module ThreadLoopScheduler
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface ThreadLoopSchedulerShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

export class ThreadLoopScheduler extends Context.Service<
  ThreadLoopScheduler,
  ThreadLoopSchedulerShape
>()("t3/orchestration/Services/ThreadLoopScheduler") {}
