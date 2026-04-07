import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { assert } from "@effect/vitest";
import {
  CommandId,
  EventId,
  ProjectId,
  ThreadId,
  TurnId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { Effect, Exit, Layer, ManagedRuntime, PubSub, Ref, Scope, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { afterEach, describe, it } from "vitest";

import { ServerConfig } from "../../config.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { layerConfig as SqlitePersistenceLive } from "../../persistence/Layers/Sqlite.ts";
import { ProjectionThreadLoopRepository } from "../../persistence/Services/ProjectionThreadLoops.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ThreadLoopScheduler } from "../Services/ThreadLoopScheduler.ts";
import { makeThreadLoopScheduler, ThreadLoopSchedulerLive } from "./ThreadLoopScheduler.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";

const asThreadId = (value: string) => ThreadId.makeUnsafe(value);
const asProjectId = (value: string) => ProjectId.makeUnsafe(value);
const now = "2026-04-07T12:00:00.000Z";

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const poll = async (): Promise<void> => {
    if (await predicate()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for expectation.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    return poll();
  };

  return poll();
}

describe("ThreadLoopScheduler", () => {
  let runtime: ManagedRuntime.ManagedRuntime<ThreadLoopScheduler, never> | null = null;
  let scope: Scope.Closeable | null = null;

  afterEach(async () => {
    if (scope) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
    scope = null;
    if (runtime) {
      await runtime.dispose();
    }
    runtime = null;
  });

  async function createHarness(input: {
    sessionStatus: "ready" | "running" | "interrupted" | "stopped" | "error";
    activeTurnId: string | null;
  }) {
    const commandsRef = Effect.runSync(Ref.make<Array<OrchestrationCommand>>([]));
    const loopsRef = Effect.runSync(
      Ref.make([
        {
          threadId: asThreadId("thread-1"),
          enabled: true,
          prompt: "Check the deployment",
          intervalMinutes: 30,
          nextRunAt: "2026-04-07T11:00:00.000Z",
          lastRunAt: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    );
    const readModelRef = Effect.runSync(
      Ref.make<OrchestrationReadModel>({
        snapshotSequence: 0,
        updatedAt: now,
        projects: [
          {
            id: asProjectId("project-1"),
            title: "Project",
            workspaceRoot: "/tmp/project",
            defaultModelSelection: {
              provider: "codex",
              model: "gpt-5-codex",
            },
            scripts: [],
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
        ],
        threads: [
          {
            id: asThreadId("thread-1"),
            projectId: asProjectId("project-1"),
            title: "Thread",
            modelSelection: {
              provider: "codex",
              model: "gpt-5-codex",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            latestTurn: null,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            deletedAt: null,
            messages: [],
            proposedPlans: [],
            activities: [],
            checkpoints: [],
            session: {
              threadId: asThreadId("thread-1"),
              status: input.sessionStatus,
              providerName: "codex",
              runtimeMode: "full-access",
              activeTurnId: input.activeTurnId ? TurnId.makeUnsafe(input.activeTurnId) : null,
              lastError: null,
              updatedAt: now,
            },
            loop: {
              enabled: true,
              prompt: "Check the deployment",
              intervalMinutes: 30,
              nextRunAt: "2026-04-07T11:00:00.000Z",
              lastRunAt: null,
              lastError: null,
              createdAt: now,
              updatedAt: now,
            },
          },
        ],
      }),
    );
    const eventPubSub = Effect.runSync(PubSub.unbounded<OrchestrationEvent>());

    runtime = ManagedRuntime.make(
      Layer.effect(ThreadLoopScheduler, makeThreadLoopScheduler).pipe(
        Layer.provideMerge(
          Layer.succeed(ProjectionThreadLoopRepository, {
            upsert: () => Effect.void,
            getByThreadId: ({ threadId }) =>
              Ref.get(loopsRef).pipe(
                Effect.map((loops) => {
                  const loop = loops.find((entry) => entry.threadId === threadId);
                  return loop ? { _tag: "Some", value: loop } : { _tag: "None" };
                }),
              ) as never,
            listAll: () => Ref.get(loopsRef),
            listDue: ({ dueBefore }) =>
              Ref.get(loopsRef).pipe(
                Effect.map((loops) =>
                  loops.filter(
                    (loop) =>
                      loop.enabled && loop.nextRunAt !== null && loop.nextRunAt <= dueBefore,
                  ),
                ),
              ),
            claimDueRun: ({ threadId, expectedNextRunAt, nextRunAt, updatedAt }) =>
              Ref.modify(loopsRef, (loops) => {
                let claimed = false;
                const nextLoops = loops.map((loop) => {
                  if (
                    loop.threadId !== threadId ||
                    !loop.enabled ||
                    loop.nextRunAt !== expectedNextRunAt
                  ) {
                    return loop;
                  }
                  claimed = true;
                  return {
                    ...loop,
                    nextRunAt,
                    updatedAt,
                  };
                });
                return [claimed, nextLoops] as const;
              }),
            deleteByThreadId: ({ threadId }) =>
              Ref.update(loopsRef, (loops) =>
                loops.filter((loop) => loop.threadId !== threadId),
              ).pipe(Effect.asVoid),
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(OrchestrationEngineService, {
            getReadModel: () => Ref.get(readModelRef),
            readEvents: () => Stream.empty,
            dispatch: (command: OrchestrationCommand) =>
              Effect.gen(function* () {
                yield* Ref.update(commandsRef, (commands) => [...commands, command]);
                if (command.type === "thread.loop.sync") {
                  yield* Ref.update(readModelRef, (readModel) => ({
                    ...readModel,
                    threads: readModel.threads.map((thread) =>
                      thread.id !== command.threadId || !thread.loop
                        ? thread
                        : {
                            ...thread,
                            loop: {
                              ...thread.loop,
                              ...(command.patch.enabled !== undefined
                                ? { enabled: command.patch.enabled }
                                : {}),
                              ...(command.patch.nextRunAt !== undefined
                                ? { nextRunAt: command.patch.nextRunAt }
                                : {}),
                              ...(command.patch.lastRunAt !== undefined
                                ? { lastRunAt: command.patch.lastRunAt }
                                : {}),
                              ...(command.patch.lastError !== undefined
                                ? { lastError: command.patch.lastError }
                                : {}),
                              updatedAt: command.createdAt,
                            },
                          },
                    ),
                  }));
                }
                return { sequence: 1 };
              }),
            streamDomainEvents: Stream.fromPubSub(eventPubSub),
          }),
        ),
      ),
    );

    scope = await Effect.runPromise(Scope.make("sequential"));
    const scheduler = await runtime.runPromise(Effect.service(ThreadLoopScheduler));
    await Effect.runPromise(scheduler.start().pipe(Scope.provide(scope)));

    return {
      commandsRef,
      loopsRef,
      eventPubSub,
    };
  }

  it("dispatches thread.turn.start for a due loop on an idle thread", async () => {
    const harness = await createHarness({
      sessionStatus: "ready",
      activeTurnId: null,
    });

    await waitFor(async () => {
      const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
      return commands.some((command) => command.type === "thread.turn.start");
    });

    const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
    assert.isTrue(commands.some((command) => command.type === "thread.turn.start"));
    assert.isTrue(
      commands.some(
        (command) =>
          command.type === "thread.loop.sync" &&
          command.patch.nextRunAt !== undefined &&
          typeof command.patch.lastRunAt === "string",
      ),
    );
  });

  it("does not treat ready plus a zombie active turn as busy", async () => {
    const harness = await createHarness({
      sessionStatus: "ready",
      activeTurnId: "turn-zombie-ready",
    });

    await waitFor(async () => {
      const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
      return commands.some((command) => command.type === "thread.turn.start");
    });

    const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
    assert.isTrue(commands.some((command) => command.type === "thread.turn.start"));
    assert.isFalse(
      commands.some(
        (command) =>
          command.type === "thread.activity.append" &&
          command.activity.kind === "loop.tick.skipped",
      ),
    );
  });

  it("skips a due loop while the thread is busy", async () => {
    const harness = await createHarness({
      sessionStatus: "running",
      activeTurnId: "turn-active",
    });

    await waitFor(async () => {
      const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
      return commands.some(
        (command) =>
          command.type === "thread.activity.append" &&
          command.activity.kind === "loop.tick.skipped",
      );
    });

    const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
    assert.isFalse(commands.some((command) => command.type === "thread.turn.start"));
    assert.isTrue(
      commands.some(
        (command) =>
          command.type === "thread.loop.sync" &&
          command.patch.nextRunAt !== undefined &&
          command.patch.lastRunAt === undefined,
      ),
    );
    assert.isTrue(
      commands.some(
        (command) =>
          command.type === "thread.activity.append" &&
          command.activity.kind === "loop.tick.skipped",
      ),
    );
  });

  it("does not treat terminal zombie sessions as busy", async () => {
    const harness = await createHarness({
      sessionStatus: "error",
      activeTurnId: "turn-zombie-error",
    });

    await waitFor(async () => {
      const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
      return commands.some((command) => command.type === "thread.turn.start");
    });

    const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
    assert.isTrue(commands.some((command) => command.type === "thread.turn.start"));
    assert.isFalse(
      commands.some(
        (command) =>
          command.type === "thread.activity.append" &&
          command.activity.kind === "loop.tick.skipped",
      ),
    );
  });

  it("pauses the loop when the thread is archived", async () => {
    const harness = await createHarness({
      sessionStatus: "ready",
      activeTurnId: null,
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    await Effect.runPromise(
      PubSub.publish(harness.eventPubSub, {
        sequence: 1,
        eventId: EventId.makeUnsafe("evt-thread-archived"),
        aggregateKind: "thread",
        aggregateId: asThreadId("thread-1"),
        occurredAt: "2026-04-07T12:05:00.000Z",
        commandId: CommandId.makeUnsafe("cmd-thread-archived"),
        causationEventId: null,
        correlationId: CommandId.makeUnsafe("cmd-thread-archived"),
        metadata: {},
        type: "thread.archived",
        payload: {
          threadId: asThreadId("thread-1"),
          archivedAt: "2026-04-07T12:05:00.000Z",
          updatedAt: "2026-04-07T12:05:00.000Z",
        },
      }),
    );

    await waitFor(async () => {
      const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
      return commands.some(
        (command) =>
          command.type === "thread.loop.sync" &&
          command.patch.enabled === false &&
          command.patch.nextRunAt === null,
      );
    });

    const commands = await Effect.runPromise(Ref.get(harness.commandsRef));
    assert.isTrue(
      commands.some(
        (command) =>
          command.type === "thread.loop.sync" &&
          command.patch.enabled === false &&
          command.patch.nextRunAt === null,
      ),
    );
  });

  it("recovers a dirty boot snapshot and resumes due loops after restart", async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-thread-loop-restart-"));
    const makeServerConfigLayer = () => ServerConfig.layerTest(process.cwd(), baseDir);
    const makeSchedulerRuntime = () => {
      const serverConfigLayer = makeServerConfigLayer();
      const sqliteLayer = SqlitePersistenceLive.pipe(
        Layer.provideMerge(serverConfigLayer),
        Layer.provideMerge(NodeServices.layer),
      );
      const orchestrationLayer = OrchestrationEngineLive.pipe(
        Layer.provide(OrchestrationProjectionSnapshotQueryLive),
        Layer.provide(OrchestrationProjectionPipelineLive),
        Layer.provide(OrchestrationEventStoreLive),
        Layer.provide(OrchestrationCommandReceiptRepositoryLive),
        Layer.provide(sqliteLayer),
        Layer.provideMerge(serverConfigLayer),
        Layer.provideMerge(NodeServices.layer),
      );

      return ManagedRuntime.make(
        ThreadLoopSchedulerLive.pipe(
          Layer.provide(sqliteLayer),
          Layer.provideMerge(orchestrationLayer),
        ),
      );
    };
    const makeSqlRuntime = () =>
      ManagedRuntime.make(
        SqlitePersistenceLive.pipe(
          Layer.provideMerge(makeServerConfigLayer()),
          Layer.provideMerge(NodeServices.layer),
        ),
      );

    const seedRuntime = makeSqlRuntime();

    try {
      const sql = await seedRuntime.runPromise(Effect.service(SqlClient.SqlClient));

      await seedRuntime.runPromise(sql`DELETE FROM projection_projects`);
      await seedRuntime.runPromise(sql`DELETE FROM projection_threads`);
      await seedRuntime.runPromise(sql`DELETE FROM projection_thread_sessions`);
      await seedRuntime.runPromise(sql`DELETE FROM projection_thread_loops`);
      await seedRuntime.runPromise(sql`DELETE FROM projection_turns`);

      await seedRuntime.runPromise(sql`
        INSERT INTO projection_projects (
          project_id,
          title,
          workspace_root,
          default_model_selection_json,
          scripts_json,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          'project-restart',
          'Project Restart',
          '/tmp/project-restart',
          '{"provider":"codex","model":"gpt-5-codex"}',
          '[]',
          '2026-04-07T11:00:00.000Z',
          '2026-04-07T11:00:01.000Z',
          NULL
        )
      `);
      await seedRuntime.runPromise(sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          branch,
          worktree_path,
          latest_turn_id,
          created_at,
          updated_at,
          archived_at,
          deleted_at
        )
        VALUES (
          'thread-restart',
          'project-restart',
          'Thread Restart',
          '{"provider":"codex","model":"gpt-5-codex"}',
          'full-access',
          'default',
          NULL,
          NULL,
          NULL,
          '2026-04-07T11:00:02.000Z',
          '2026-04-07T11:00:03.000Z',
          NULL,
          NULL
        )
      `);
      await seedRuntime.runPromise(sql`
        INSERT INTO projection_thread_sessions (
          thread_id,
          status,
          provider_name,
          runtime_mode,
          active_turn_id,
          last_error,
          updated_at
        )
        VALUES (
          'thread-restart',
          'running',
          'codex',
          'full-access',
          'turn-zombie-restart',
          NULL,
          '2026-04-07T11:00:04.000Z'
        )
      `);
      await seedRuntime.runPromise(sql`
        INSERT INTO projection_turns (
          thread_id,
          turn_id,
          pending_message_id,
          source_proposed_plan_thread_id,
          source_proposed_plan_id,
          assistant_message_id,
          state,
          requested_at,
          started_at,
          completed_at,
          checkpoint_turn_count,
          checkpoint_ref,
          checkpoint_status,
          checkpoint_files_json
        )
        VALUES (
          'thread-restart',
          'turn-zombie-restart',
          NULL,
          NULL,
          NULL,
          NULL,
          'running',
          '2026-04-07T11:00:04.000Z',
          '2026-04-07T11:00:04.000Z',
          NULL,
          NULL,
          NULL,
          NULL,
          '[]'
        )
      `);
      await seedRuntime.runPromise(sql`
        INSERT INTO projection_thread_loops (
          thread_id,
          enabled,
          prompt,
          interval_minutes,
          next_run_at,
          last_run_at,
          last_error,
          created_at,
          updated_at
        )
        VALUES (
          'thread-restart',
          1,
          'Resume after restart',
          30,
          '2026-04-07T10:00:00.000Z',
          NULL,
          NULL,
          '2026-04-07T11:00:05.000Z',
          '2026-04-07T11:00:05.000Z'
        )
      `);
    } finally {
      await seedRuntime.dispose();
    }

    const restartRuntime = makeSchedulerRuntime();
    const scope = await Effect.runPromise(Scope.make("sequential"));

    try {
      const engine = await restartRuntime.runPromise(Effect.service(OrchestrationEngineService));
      const scheduler = await restartRuntime.runPromise(Effect.service(ThreadLoopScheduler));

      const bootReadModel = await restartRuntime.runPromise(engine.getReadModel());
      const bootThread = bootReadModel.threads.find(
        (thread) => thread.id === asThreadId("thread-restart"),
      );
      assert.equal(bootThread?.session?.status, "interrupted");
      assert.equal(bootThread?.session?.activeTurnId, null);
      assert.equal(bootThread?.latestTurn?.state, "interrupted");
      assert.equal(bootThread?.latestTurn?.completedAt, "2026-04-07T11:00:04.000Z");

      await restartRuntime.runPromise(scheduler.start().pipe(Scope.provide(scope)));

      await waitFor(async () => {
        const readModel = await restartRuntime.runPromise(engine.getReadModel());
        const thread = readModel.threads.find((entry) => entry.id === asThreadId("thread-restart"));
        return Boolean(
          thread?.activities.some((activity) => activity.kind === "loop.tick.started") &&
          thread.loop?.lastRunAt,
        );
      });

      const readModel = await restartRuntime.runPromise(engine.getReadModel());
      const thread = readModel.threads.find((entry) => entry.id === asThreadId("thread-restart"));
      assert.isTrue(
        thread?.activities.some((activity) => activity.kind === "loop.tick.started") ?? false,
      );
      assert.isTrue(typeof thread?.loop?.lastRunAt === "string");
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      await restartRuntime.dispose();
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
