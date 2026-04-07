/**
 * ThreadLoopScheduler - Server-side scheduler for per-thread loops.
 *
 * Drives persisted loop state and dispatches loop-backed thread turns when a
 * thread becomes due.
 *
 * @module ThreadLoopScheduler
 */
import { ServiceMap } from "effect";
import type { Effect, Scope } from "effect";

export interface ThreadLoopSchedulerShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

export class ThreadLoopScheduler extends ServiceMap.Service<
  ThreadLoopScheduler,
  ThreadLoopSchedulerShape
>()("t3/orchestration/Services/ThreadLoopScheduler") {}
