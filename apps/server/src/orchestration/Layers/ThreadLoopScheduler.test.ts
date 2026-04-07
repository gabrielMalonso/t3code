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
import { afterEach, describe, it } from "vitest";

import { ProjectionThreadLoopRepository } from "../../persistence/Services/ProjectionThreadLoops.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ThreadLoopScheduler } from "../Services/ThreadLoopScheduler.ts";
import { makeThreadLoopScheduler } from "./ThreadLoopScheduler.ts";

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
    sessionStatus: "ready" | "running";
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
      commands.some((command) => command.type === "thread.loop.sync" && "patch" in command),
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
});
