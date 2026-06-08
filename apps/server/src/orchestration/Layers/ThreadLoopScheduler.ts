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
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { ProjectionThreadActivityRepositoryLive } from "../../persistence/Layers/ProjectionThreadActivities.ts";
import { ProjectionThreadLoopRepositoryLive } from "../../persistence/Layers/ProjectionThreadLoops.ts";
import {
  ProjectionThreadActivityRepository,
  type ProjectionThreadActivity,
} from "../../persistence/Services/ProjectionThreadActivities.ts";
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
const DEFAULT_THREAD_LOOP_COMPACT_CONTEXT_USAGE_THRESHOLD_PERCENT = 50;

function normalizeBeforeRunCompactTiming(
  timing: "disabled" | "before" | "after" | undefined,
): "disabled" | "before" {
  return timing === undefined || timing === "disabled" ? "disabled" : "before";
}

class ThreadLoopSchedulerError extends Data.TaggedError("ThreadLoopSchedulerError")<{
  readonly message: string;
}> {}

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
  if (normalizeBeforeRunCompactTiming(loop.compactTiming) !== "before") {
    return false;
  }
  const compactEveryRuns = Math.max(1, loop.compactEveryRuns ?? 1);
  const runsSinceCompaction = Math.max(0, loop.runsSinceCompaction ?? 0);
  return runsSinceCompaction + 1 >= compactEveryRuns;
}

function nextRunsSinceCompactionAfterNormalRun(loop: {
  readonly compactTiming?: "disabled" | "before" | "after" | undefined;
  readonly compactEveryRuns?: number | undefined;
  readonly runsSinceCompaction?: number | undefined;
}): number {
  if (normalizeBeforeRunCompactTiming(loop.compactTiming) !== "before") {
    return 0;
  }
  const compactEveryRuns = Math.max(1, loop.compactEveryRuns ?? 1);
  return Math.min(compactEveryRuns, Math.max(0, loop.runsSinceCompaction ?? 0) + 1);
}

function getPayloadNumber(payload: unknown, key: string): number | null {
  if (typeof payload !== "object" || payload === null || !(key in payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compareProjectionThreadActivities(
  left: ProjectionThreadActivity,
  right: ProjectionThreadActivity,
): number {
  if (
    left.sequence !== undefined &&
    right.sequence !== undefined &&
    left.sequence !== right.sequence
  ) {
    return left.sequence - right.sequence;
  }
  const createdAtDiff = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }
  return String(left.activityId).localeCompare(String(right.activityId));
}

function getCompactContextUsageDecision(input: {
  readonly latestUsage: ProjectionThreadActivity | null;
  readonly latestCompaction: ProjectionThreadActivity | null;
  readonly thresholdPercent?: number | undefined;
}): { readonly shouldCompact: boolean; readonly detail: string } {
  const thresholdPercent =
    input.thresholdPercent ?? DEFAULT_THREAD_LOOP_COMPACT_CONTEXT_USAGE_THRESHOLD_PERCENT;
  if (!input.latestUsage) {
    return {
      shouldCompact: false,
      detail: `No context usage activity is available for the ${thresholdPercent}% threshold.`,
    };
  }
  if (
    input.latestCompaction &&
    compareProjectionThreadActivities(input.latestUsage, input.latestCompaction) <= 0
  ) {
    return {
      shouldCompact: false,
      detail: `Latest context usage is older than the latest compaction; waiting for fresh usage before applying the ${thresholdPercent}% threshold.`,
    };
  }

  const usedTokens = getPayloadNumber(input.latestUsage.payload, "usedTokens");
  const maxTokens = getPayloadNumber(input.latestUsage.payload, "maxTokens");
  if (usedTokens === null || maxTokens === null || maxTokens <= 0) {
    return {
      shouldCompact: false,
      detail: `Latest context usage is missing token totals for the ${thresholdPercent}% threshold.`,
    };
  }
  const usedPercent = (usedTokens / maxTokens) * 100;
  if (usedPercent < thresholdPercent) {
    return {
      shouldCompact: false,
      detail: `Context usage is ${Math.round(usedPercent)}%, below the ${thresholdPercent}% threshold.`,
    };
  }
  return {
    shouldCompact: true,
    detail: `Context usage is ${Math.round(usedPercent)}%, at or above the ${thresholdPercent}% threshold.`,
  };
}

export const makeThreadLoopScheduler = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const projectionThreadActivityRepository = yield* ProjectionThreadActivityRepository;
  const projectionThreadLoopRepository = yield* ProjectionThreadLoopRepository;

  const makeServerCommandId = (tag: string) =>
    crypto.randomUUIDv4.pipe(Effect.map((uuid) => CommandId.make(`server:${tag}:${uuid}`)));

  const makeEventId = crypto.randomUUIDv4.pipe(Effect.map((uuid) => EventId.make(uuid)));

  const makeLoopMessageId = crypto.randomUUIDv4.pipe(
    Effect.map((uuid) => MessageId.make(`loop-msg:${uuid}`)),
  );

  const appendLoopActivity = (input: {
    readonly threadId: ThreadId;
    readonly kind:
      | "loop.tick.started"
      | "loop.tick.skipped"
      | "loop.tick.failed"
      | "loop.compaction.started"
      | "loop.compaction.skipped"
      | "loop.paused";
    readonly summary: string;
    readonly detail?: string;
    readonly tone?: "info" | "error";
    readonly createdAt: string;
  }) =>
    Effect.gen(function* () {
      const commandId = yield* makeServerCommandId("thread-loop-activity");
      const eventId = yield* makeEventId;
      return yield* orchestrationEngine.dispatch({
        type: "thread.activity.append",
        commandId,
        threadId: input.threadId,
        activity: {
          id: eventId,
          tone: input.tone ?? "info",
          kind: input.kind,
          summary: input.summary,
          payload: input.detail ? { detail: input.detail } : {},
          turnId: null,
          createdAt: input.createdAt,
        },
        createdAt: input.createdAt,
      });
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
    Effect.gen(function* () {
      const commandId = yield* makeServerCommandId("thread-loop-sync");
      return yield* orchestrationEngine.dispatch({
        type: "thread.loop.sync",
        commandId,
        threadId: input.threadId,
        patch: input.patch,
        createdAt: input.createdAt,
      });
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
    const currentLoop = thread.loop;

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
        kind: "loop.compaction.started",
        summary: "Loop context compaction started before the run",
        createdAt: input.createdAt,
      });
      const commandId = yield* makeServerCommandId("thread-loop-compact-start");
      yield* orchestrationEngine.dispatch({
        type: "thread.compact.start",
        commandId,
        threadId: input.threadId,
        createdAt: input.createdAt,
      });
      yield* waitForContextCompaction({
        threadId: input.threadId,
        compactRequestedAt: input.createdAt,
      });
    });

    const compactionDueBeforeRun = shouldCompactBeforeRun(currentLoop);
    const contextUsageDecision = compactionDueBeforeRun
      ? yield* Effect.all(
          [
            projectionThreadActivityRepository.getLatestByThreadIdAndKind({
              threadId: loop.threadId,
              kind: "context-window.updated",
            }),
            projectionThreadActivityRepository.getLatestByThreadIdAndKind({
              threadId: loop.threadId,
              kind: "context-compaction",
            }),
          ],
          { concurrency: 2 },
        ).pipe(
          Effect.map(([latestUsage, latestCompaction]) =>
            getCompactContextUsageDecision({
              latestUsage: Option.getOrNull(latestUsage),
              latestCompaction: Option.getOrNull(latestCompaction),
              thresholdPercent: currentLoop.compactContextUsageThresholdPercent,
            }),
          ),
        )
      : null;
    const shouldCompact = contextUsageDecision?.shouldCompact ?? false;
    let runsSinceCompactionAfterRun = nextRunsSinceCompactionAfterNormalRun(currentLoop);

    if (compactionDueBeforeRun && contextUsageDecision && !contextUsageDecision.shouldCompact) {
      yield* appendLoopActivity({
        threadId: loop.threadId,
        kind: "loop.compaction.skipped",
        summary: "Loop context compaction skipped before the run",
        detail: contextUsageDecision.detail,
        createdAt: nowIso,
      });
    }

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
            runsSinceCompaction: 0,
          },
        });
        return;
      }
      runsSinceCompactionAfterRun = 0;
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

    const loopMessageId = yield* makeLoopMessageId;
    const commandId = yield* makeServerCommandId("thread-loop-turn-start");
    yield* orchestrationEngine
      .dispatch({
        type: "thread.turn.start",
        commandId,
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
).pipe(
  Layer.provideMerge(ProjectionThreadActivityRepositoryLive),
  Layer.provideMerge(ProjectionThreadLoopRepositoryLive),
);
