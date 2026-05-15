import {
  CommandId,
  EventId,
  MessageId,
  ThreadId,
  type OrchestrationSessionStatus,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { ProjectionThreadLoopRepositoryLive } from "../../persistence/Layers/ProjectionThreadLoops.ts";
import {
  ProjectionThreadLoopRepository,
  type ProjectionThreadLoop,
} from "../../persistence/Services/ProjectionThreadLoops.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  ThreadLoopScheduler,
  type ThreadLoopSchedulerShape,
} from "../Services/ThreadLoopScheduler.ts";
import { computeThreadLoopNextRunAt } from "../threadLoop.ts";
import { sessionStatusAllowsActiveTurn } from "../sessionState.ts";

const THREAD_LOOP_SCHEDULER_INTERVAL_MS = 10_000;
const THREAD_LOOP_COMPACT_POLL_MS = 1_000;
const THREAD_LOOP_COMPACT_TIMEOUT_MS = 10 * 60_000;
const THREAD_LOOP_COMPACT_CONTEXT_USAGE_THRESHOLD = 0.5;

class ThreadLoopSchedulerError extends Data.TaggedError("ThreadLoopSchedulerError")<{
  readonly message: string;
}> {}

const serverCommandId = (tag: string) => CommandId.make(`server:${tag}:${crypto.randomUUID()}`);

const isThreadLoopBusy = (thread: {
  readonly session: {
    readonly status: OrchestrationSessionStatus;
    readonly activeTurnId: string | null;
  } | null;
}) => thread.session !== null && sessionStatusAllowsActiveTurn(thread.session.status);

function getPayloadDetail(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("detail" in payload)) {
    return null;
  }
  const detail = (payload as { readonly detail?: unknown }).detail;
  return typeof detail === "string" && detail.trim().length > 0 ? detail : null;
}

function shouldCompactBeforeRun(loop: {
  readonly compactTiming?: "disabled" | "before" | "after" | undefined;
  readonly compactEveryRuns?: number | undefined;
  readonly runsSinceCompaction?: number | undefined;
}): boolean {
  if ((loop.compactTiming ?? "disabled") === "disabled") {
    return false;
  }
  const compactEveryRuns = Math.max(1, loop.compactEveryRuns ?? 1);
  const runsSinceCompaction = Math.max(0, loop.runsSinceCompaction ?? 0);
  return runsSinceCompaction + 1 >= compactEveryRuns;
}

function nextRunsSinceCompactionAfterRun(loop: {
  readonly compactTiming?: "disabled" | "before" | "after" | undefined;
  readonly compactEveryRuns?: number | undefined;
  readonly runsSinceCompaction?: number | undefined;
}): number {
  if ((loop.compactTiming ?? "disabled") === "disabled") {
    return 0;
  }
  if (shouldCompactBeforeRun(loop)) {
    return 0;
  }
  return Math.max(0, loop.runsSinceCompaction ?? 0) + 1;
}

function getPayloadNumber(payload: unknown, key: string): number | null {
  if (typeof payload !== "object" || payload === null || !(key in payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasCompactableContextUsage(thread: {
  readonly activities: ReadonlyArray<{
    readonly kind: string;
    readonly createdAt: string;
    readonly payload: unknown;
  }>;
}): boolean {
  const latestUsage = thread.activities
    .filter((activity) => activity.kind === "context-window.updated")
    .toSorted((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .at(0);
  if (!latestUsage) {
    return false;
  }

  const usedTokens = getPayloadNumber(latestUsage.payload, "usedTokens");
  const maxTokens = getPayloadNumber(latestUsage.payload, "maxTokens");
  if (usedTokens === null || maxTokens === null || maxTokens <= 0) {
    return false;
  }
  return usedTokens / maxTokens >= THREAD_LOOP_COMPACT_CONTEXT_USAGE_THRESHOLD;
}

export const makeThreadLoopScheduler = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const projectionThreadLoopRepository = yield* ProjectionThreadLoopRepository;

  const appendLoopActivity = (input: {
    readonly threadId: ThreadId;
    readonly kind: "loop.tick.started" | "loop.tick.skipped" | "loop.tick.failed" | "loop.paused";
    readonly summary: string;
    readonly detail?: string;
    readonly tone?: "info" | "error";
    readonly createdAt: string;
  }) =>
    orchestrationEngine.dispatch({
      type: "thread.activity.append",
      commandId: serverCommandId("thread-loop-activity"),
      threadId: input.threadId,
      activity: {
        id: EventId.make(crypto.randomUUID()),
        tone: input.tone ?? "info",
        kind: input.kind,
        summary: input.summary,
        payload: input.detail ? { detail: input.detail } : {},
        turnId: null,
        createdAt: input.createdAt,
      },
      createdAt: input.createdAt,
    });

  const syncLoopPatch = (input: {
    readonly threadId: ThreadId;
    readonly createdAt: string;
    readonly patch: {
      readonly enabled?: boolean;
      readonly nextRunAt?: string | null;
      readonly lastRunAt?: string | null;
      readonly lastError?: string | null;
      readonly runsSinceCompaction?: number;
    };
  }) =>
    orchestrationEngine.dispatch({
      type: "thread.loop.sync",
      commandId: serverCommandId("thread-loop-sync"),
      threadId: input.threadId,
      patch: input.patch,
      createdAt: input.createdAt,
    });

  const pauseLoopForArchivedThread = Effect.fn("pauseLoopForArchivedThread")(function* (
    event: Extract<OrchestrationEvent, { type: "thread.archived" }>,
  ) {
    const readModel = yield* projectionSnapshotQuery.getCommandReadModel();
    const thread = readModel.threads.find((entry) => entry.id === event.payload.threadId);
    if (!thread?.loop?.enabled) {
      return;
    }

    yield* syncLoopPatch({
      threadId: event.payload.threadId,
      createdAt: event.occurredAt,
      patch: {
        enabled: false,
        nextRunAt: null,
        lastError: null,
      },
    });
    yield* appendLoopActivity({
      threadId: event.payload.threadId,
      kind: "loop.paused",
      summary: "Loop paused because the thread was archived",
      createdAt: event.occurredAt,
    });
  });

  const runClaimedThreadLoop = Effect.fn("runClaimedThreadLoop")(function* (input: {
    readonly loop: ProjectionThreadLoop;
    readonly nextRunAt: string;
    readonly nowIso: string;
  }) {
    const { loop, nextRunAt, nowIso } = input;
    const readModel = yield* projectionSnapshotQuery.getCommandReadModel();
    const thread = readModel.threads.find((entry) => entry.id === loop.threadId);
    if (!thread) {
      yield* projectionThreadLoopRepository
        .deleteByThreadId({
          threadId: loop.threadId,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("thread loop scheduler failed to delete orphaned loop row", {
              threadId: loop.threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
      return;
    }
    if (!thread.loop) {
      yield* projectionThreadLoopRepository
        .deleteByThreadId({
          threadId: loop.threadId,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("thread loop scheduler failed to delete stale loop row", {
              threadId: loop.threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
      return;
    }
    if (!thread.loop.enabled) {
      yield* syncLoopPatch({
        threadId: loop.threadId,
        createdAt: nowIso,
        patch: {
          enabled: false,
          nextRunAt: null,
        },
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("thread loop scheduler failed to sync disabled loop", {
            threadId: loop.threadId,
            cause: Cause.pretty(cause),
          }),
        ),
      );
      return;
    }
    if (thread.archivedAt !== null) {
      yield* syncLoopPatch({
        threadId: loop.threadId,
        createdAt: nowIso,
        patch: {
          enabled: false,
          nextRunAt: null,
          lastError: null,
        },
      });
      yield* appendLoopActivity({
        threadId: loop.threadId,
        kind: "loop.paused",
        summary: "Loop paused because the thread was archived",
        createdAt: nowIso,
      });
      return;
    }
    if (isThreadLoopBusy(thread)) {
      yield* syncLoopPatch({
        threadId: loop.threadId,
        createdAt: nowIso,
        patch: {
          nextRunAt,
        },
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("thread loop scheduler failed to sync next run", {
            threadId: loop.threadId,
            cause: Cause.pretty(cause),
          }),
        ),
      );
      yield* appendLoopActivity({
        threadId: loop.threadId,
        kind: "loop.tick.skipped",
        summary: "Automatic loop run skipped because the thread is busy",
        createdAt: nowIso,
      });
      return;
    }

    const waitForContextCompaction = Effect.fn("waitForContextCompaction")(function* (input: {
      readonly threadId: ThreadId;
      readonly compactRequestedAt: string;
    }) {
      const startedAtMs = yield* Clock.currentTimeMillis;
      const requestedAtMs = Date.parse(input.compactRequestedAt);

      for (;;) {
        const latestThread = yield* projectionSnapshotQuery
          .getThreadDetailById(input.threadId)
          .pipe(Effect.map(Option.getOrNull));
        const activity = latestThread?.activities
          .filter(
            (candidate) =>
              Date.parse(candidate.createdAt) >= requestedAtMs &&
              (candidate.kind === "context-compaction" ||
                candidate.kind === "provider.compact.failed"),
          )
          .toSorted((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
          .at(0);

        if (activity?.kind === "context-compaction") {
          return;
        }
        if (activity?.kind === "provider.compact.failed") {
          return yield* new ThreadLoopSchedulerError({
            message: getPayloadDetail(activity.payload) ?? activity.summary,
          });
        }

        const elapsedMs = (yield* Clock.currentTimeMillis) - startedAtMs;
        if (elapsedMs > THREAD_LOOP_COMPACT_TIMEOUT_MS) {
          return yield* new ThreadLoopSchedulerError({
            message: "Timed out waiting for loop context compaction to finish.",
          });
        }
        yield* Effect.sleep(`${THREAD_LOOP_COMPACT_POLL_MS} millis`);
      }
    });

    const compactThreadForLoop = Effect.fn("compactThreadForLoop")(function* (input: {
      readonly threadId: ThreadId;
      readonly createdAt: string;
    }) {
      yield* appendLoopActivity({
        threadId: input.threadId,
        kind: "loop.tick.started",
        summary: "Loop context compaction started before the run",
        createdAt: input.createdAt,
      });
      yield* orchestrationEngine.dispatch({
        type: "thread.compact.start",
        commandId: serverCommandId("thread-loop-compact-start"),
        threadId: input.threadId,
        createdAt: input.createdAt,
      });
      yield* waitForContextCompaction({
        threadId: input.threadId,
        compactRequestedAt: input.createdAt,
      });
    });

    const shouldCompact = shouldCompactBeforeRun(thread.loop) && hasCompactableContextUsage(thread);
    const runsSinceCompactionAfterRun = nextRunsSinceCompactionAfterRun(thread.loop);

    if (shouldCompact) {
      const compactedBefore = yield* compactThreadForLoop({
        threadId: loop.threadId,
        createdAt: nowIso,
      }).pipe(
        Effect.as(true),
        Effect.catchTag("ThreadLoopSchedulerError", (error) =>
          Effect.gen(function* () {
            yield* syncLoopPatch({
              threadId: loop.threadId,
              createdAt: nowIso,
              patch: {
                lastError: error.message,
              },
            });
            yield* appendLoopActivity({
              threadId: loop.threadId,
              kind: "loop.tick.failed",
              summary: "Loop context compaction failed",
              detail: error.message,
              tone: "error",
              createdAt: nowIso,
            });
            return false;
          }),
        ),
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            const detail = Cause.pretty(cause);
            yield* syncLoopPatch({
              threadId: loop.threadId,
              createdAt: nowIso,
              patch: {
                lastError: detail,
              },
            });
            yield* appendLoopActivity({
              threadId: loop.threadId,
              kind: "loop.tick.failed",
              summary: "Loop context compaction failed",
              detail,
              tone: "error",
              createdAt: nowIso,
            });
            return false;
          }),
        ),
      );
      if (!compactedBefore) {
        return;
      }

      const refreshed = yield* projectionSnapshotQuery.getCommandReadModel();
      const refreshedThread = refreshed.threads.find((entry) => entry.id === loop.threadId);
      if (!refreshedThread) {
        return;
      }
      if (isThreadLoopBusy(refreshedThread)) {
        yield* syncLoopPatch({
          threadId: loop.threadId,
          createdAt: nowIso,
          patch: {
            runsSinceCompaction: runsSinceCompactionAfterRun,
          },
        });
        return;
      }
    }

    yield* syncLoopPatch({
      threadId: loop.threadId,
      createdAt: nowIso,
      patch: {
        nextRunAt,
        lastRunAt: nowIso,
        lastError: null,
        runsSinceCompaction: runsSinceCompactionAfterRun,
      },
    });
    yield* appendLoopActivity({
      threadId: loop.threadId,
      kind: "loop.tick.started",
      summary: "Automatic loop run started",
      createdAt: nowIso,
    });

    const loopMessageId = MessageId.make(`loop-msg:${crypto.randomUUID()}`);
    yield* orchestrationEngine
      .dispatch({
        type: "thread.turn.start",
        commandId: serverCommandId("thread-loop-turn-start"),
        threadId: loop.threadId,
        message: {
          messageId: loopMessageId,
          role: "user",
          text: loop.prompt,
          attachments: [],
        },
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        createdAt: nowIso,
      })
      .pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            const detail = Cause.pretty(cause);
            yield* syncLoopPatch({
              threadId: loop.threadId,
              createdAt: nowIso,
              patch: {
                lastError: detail,
              },
            });
            yield* appendLoopActivity({
              threadId: loop.threadId,
              kind: "loop.tick.failed",
              summary: "Automatic loop run failed",
              detail,
              tone: "error",
              createdAt: nowIso,
            });
          }),
        ),
      );
  });

  const runDueThreadLoops = Effect.fn("runDueThreadLoops")(function* (nowIso: string) {
    const dueLoops = yield* projectionThreadLoopRepository.listDue({
      dueBefore: nowIso,
    });

    for (const loop of dueLoops) {
      if (loop.nextRunAt === null) {
        continue;
      }

      const nextRunAt = computeThreadLoopNextRunAt(nowIso, loop.intervalMinutes);
      const claimed = yield* projectionThreadLoopRepository.claimDueRun({
        threadId: loop.threadId,
        expectedNextRunAt: loop.nextRunAt,
        nextRunAt,
        updatedAt: nowIso,
      });
      if (!claimed) {
        continue;
      }

      yield* Effect.forkScoped(
        runClaimedThreadLoop({ loop, nextRunAt, nowIso }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("thread loop scheduler claimed run failed", {
              threadId: loop.threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        ),
      );
    }
  });

  const start: ThreadLoopSchedulerShape["start"] = Effect.fn("start")(function* () {
    yield* Effect.forkScoped(
      Effect.gen(function* () {
        for (;;) {
          const nowIso = DateTime.formatIso(yield* DateTime.now);
          yield* runDueThreadLoops(nowIso).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("thread loop scheduler tick failed", {
                cause: Cause.pretty(cause),
              }),
            ),
          );
          yield* Effect.sleep(`${THREAD_LOOP_SCHEDULER_INTERVAL_MS} millis`);
        }
      }),
    );

    yield* Effect.forkScoped(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
        if (event.type !== "thread.archived") {
          return Effect.void;
        }
        return pauseLoopForArchivedThread(event).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("thread loop scheduler failed to pause archived thread loop", {
              threadId: event.payload.threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
      }),
    );
  });

  return {
    start,
  } satisfies ThreadLoopSchedulerShape;
});

export const ThreadLoopSchedulerLive = Layer.effect(
  ThreadLoopScheduler,
  makeThreadLoopScheduler,
).pipe(Layer.provideMerge(ProjectionThreadLoopRepositoryLive));
