/**
 * ThreadLoopScheduler - Server-side scheduler for per-thread loops.
 *
 * Drives persisted loop state and dispatches loop-backed thread turns when a
 * thread becomes due.
 *
 * @module ThreadLoopScheduler
 */
import { Context } from "effect";
import type { Effect, Scope } from "effect";

export interface ThreadLoopSchedulerShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

export class ThreadLoopScheduler extends Context.Service<
  ThreadLoopScheduler,
  ThreadLoopSchedulerShape
>()("t3/orchestration/Services/ThreadLoopScheduler") {}
