import {
  CommandId,
  EventId,
  MessageId,
  ThreadId,
  type OrchestrationSessionStatus,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { Cause, Effect, Layer, Stream } from "effect";

import { ProjectionThreadLoopRepositoryLive } from "../../persistence/Layers/ProjectionThreadLoops.ts";
import { ProjectionThreadLoopRepository } from "../../persistence/Services/ProjectionThreadLoops.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  ThreadLoopScheduler,
  type ThreadLoopSchedulerShape,
} from "../Services/ThreadLoopScheduler.ts";
import { computeThreadLoopNextRunAt } from "../threadLoop.ts";
import { sessionStatusAllowsActiveTurn } from "../sessionState.ts";

const THREAD_LOOP_SCHEDULER_INTERVAL_MS = 10_000;

const serverCommandId = (tag: string) =>
  CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);

const isThreadLoopBusy = (thread: {
  readonly session: {
    readonly status: OrchestrationSessionStatus;
    readonly activeTurnId: string | null;
  } | null;
}) => thread.session !== null && sessionStatusAllowsActiveTurn(thread.session.status);

const describeThreadLoopState = (input: {
  readonly threadId: ThreadId;
  readonly loop: {
    readonly enabled: boolean;
    readonly intervalMinutes: number;
    readonly nextRunAt: string | null;
    readonly lastRunAt: string | null;
    readonly lastError: string | null;
  };
  readonly session: {
    readonly status: string;
    readonly activeTurnId: string | null;
  } | null;
  readonly archivedAt: string | null;
}) => ({
  threadId: input.threadId,
  loopEnabled: input.loop.enabled,
  intervalMinutes: input.loop.intervalMinutes,
  nextRunAt: input.loop.nextRunAt,
  lastRunAt: input.loop.lastRunAt,
  lastError: input.loop.lastError,
  archivedAt: input.archivedAt,
  sessionStatus: input.session?.status ?? null,
  sessionActiveTurnId: input.session?.activeTurnId ?? null,
});

export const makeThreadLoopScheduler = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
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
        id: EventId.makeUnsafe(crypto.randomUUID()),
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
    const readModel = yield* orchestrationEngine.getReadModel();
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

  const runDueThreadLoops = Effect.fn("runDueThreadLoops")(function* (nowIso: string) {
    const dueLoops = yield* projectionThreadLoopRepository.listDue({
      dueBefore: nowIso,
    });
    if (dueLoops.length > 0) {
      yield* Effect.logInfo("thread loop scheduler found due loops", {
        nowIso,
        dueLoopCount: dueLoops.length,
        dueLoops: dueLoops.map((loop) => ({
          threadId: loop.threadId,
          nextRunAt: loop.nextRunAt,
          intervalMinutes: loop.intervalMinutes,
          updatedAt: loop.updatedAt,
        })),
      });
    }

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
        yield* Effect.logInfo("thread loop scheduler claim skipped", {
          threadId: loop.threadId,
          expectedNextRunAt: loop.nextRunAt,
          nextRunAt,
          nowIso,
        });
        continue;
      }

      const readModel = yield* orchestrationEngine.getReadModel();
      const thread = readModel.threads.find((entry) => entry.id === loop.threadId);
      if (!thread) {
        yield* Effect.logWarning("thread loop scheduler deleting orphaned loop row", {
          threadId: loop.threadId,
          nextRunAt: loop.nextRunAt,
          nowIso,
        });
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
        continue;
      }
      if (!thread.loop) {
        yield* Effect.logWarning("thread loop scheduler deleting stale loop row", {
          threadId: loop.threadId,
          nextRunAt: loop.nextRunAt,
          nowIso,
        });
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
        continue;
      }
      if (!thread.loop.enabled) {
        yield* Effect.logInfo("thread loop scheduler found disabled loop during due tick", {
          ...describeThreadLoopState({
            threadId: loop.threadId,
            loop: thread.loop,
            session: thread.session,
            archivedAt: thread.archivedAt,
          }),
          nowIso,
        });
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
        continue;
      }
      if (thread.archivedAt !== null) {
        yield* Effect.logInfo("thread loop scheduler pausing archived thread loop", {
          ...describeThreadLoopState({
            threadId: loop.threadId,
            loop: thread.loop,
            session: thread.session,
            archivedAt: thread.archivedAt,
          }),
          nowIso,
        });
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
        continue;
      }
      if (isThreadLoopBusy(thread)) {
        yield* Effect.logInfo("thread loop scheduler skipped due loop because thread is busy", {
          ...describeThreadLoopState({
            threadId: loop.threadId,
            loop: thread.loop,
            session: thread.session,
            archivedAt: thread.archivedAt,
          }),
          claimedNextRunAt: nextRunAt,
          nowIso,
        });
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
        continue;
      }

      yield* Effect.logInfo("thread loop scheduler dispatching automatic run", {
        ...describeThreadLoopState({
          threadId: loop.threadId,
          loop: thread.loop,
          session: thread.session,
          archivedAt: thread.archivedAt,
        }),
        claimedNextRunAt: nextRunAt,
        nowIso,
      });
      yield* syncLoopPatch({
        threadId: loop.threadId,
        createdAt: nowIso,
        patch: {
          nextRunAt,
          lastRunAt: nowIso,
          lastError: null,
        },
      });
      yield* appendLoopActivity({
        threadId: loop.threadId,
        kind: "loop.tick.started",
        summary: "Automatic loop run started",
        createdAt: nowIso,
      });

      yield* orchestrationEngine
        .dispatch({
          type: "thread.turn.start",
          commandId: serverCommandId("thread-loop-turn-start"),
          threadId: loop.threadId,
          message: {
            messageId: MessageId.makeUnsafe(`loop-msg:${crypto.randomUUID()}`),
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
    }
  });

  const start: ThreadLoopSchedulerShape["start"] = Effect.fn("start")(function* () {
    const readModel = yield* orchestrationEngine.getReadModel();
    const persistedLoops = yield* projectionThreadLoopRepository.listAll().pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("thread loop scheduler failed to inspect persisted loops on startup", {
          cause: Cause.pretty(cause),
        }).pipe(Effect.as([])),
      ),
    );
    const activePersistedLoops = persistedLoops.filter((loop) => loop.enabled);
    yield* Effect.logInfo("thread loop scheduler starting", {
      persistedLoopCount: persistedLoops.length,
      activePersistedLoopCount: activePersistedLoops.length,
      activeLoops: activePersistedLoops.map((loop) => {
        const thread = readModel.threads.find((entry) => entry.id === loop.threadId);
        return describeThreadLoopState({
          threadId: loop.threadId,
          loop,
          session: thread?.session ?? null,
          archivedAt: thread?.archivedAt ?? null,
        });
      }),
    });

    yield* Effect.forkScoped(
      Effect.gen(function* () {
        for (;;) {
          const nowIso = new Date().toISOString();
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
