import {
  EventId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
  TurnId,
  type OpenPetsRuntimeStatus,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import type { OpenPetsNotifyInput } from "../../openpets/Services/OpenPetsBridge.ts";
import { OpenPetsBridge } from "../../openpets/Services/OpenPetsBridge.ts";
import {
  ProviderService,
  type ProviderServiceShape,
} from "../../provider/Services/ProviderService.ts";
import { OpenPetsReactor } from "../Services/OpenPetsReactor.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "../Services/ProjectionSnapshotQuery.ts";
import { OpenPetsReactorInternals, OpenPetsReactorLive } from "./OpenPetsReactor.ts";

const drainFibers = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, {
  discard: true,
});

const openPetsStatus: OpenPetsRuntimeStatus = {
  supported: true,
  enabled: true,
  binaryPath: "openpets",
  cliAvailable: true,
  petReachable: true,
  lastError: null,
  lastEventAt: null,
};

const threadShell = {
  id: ThreadId.make("thread-1"),
  projectId: ProjectId.make("project-1"),
  title: "Improve OpenPets sync",
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5.4",
  },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: "2026-05-10T12:00:00.000Z",
  updatedAt: "2026-05-10T12:00:00.000Z",
  archivedAt: null,
  session: null,
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
} as const;

function makeEvent<T extends ProviderRuntimeEvent["type"]>(
  type: T,
  payload: Extract<ProviderRuntimeEvent, { type: T }>["payload"],
  overrides: Partial<Extract<ProviderRuntimeEvent, { type: T }>> = {},
): Extract<ProviderRuntimeEvent, { type: T }> {
  return {
    eventId: EventId.make(`${type}:event`),
    provider: ProviderDriverKind.make("codex"),
    providerInstanceId: ProviderInstanceId.make("codex"),
    threadId: ThreadId.make("thread-1"),
    turnId: TurnId.make("turn-1"),
    createdAt: "2026-05-10T12:00:00.000Z",
    type,
    payload,
    ...overrides,
  } as Extract<ProviderRuntimeEvent, { type: T }>;
}

function makeHarness(events: ReadonlyArray<ProviderRuntimeEvent>) {
  const notifications: OpenPetsNotifyInput[] = [];
  const unsupported = () => Effect.die(new Error("Unsupported provider call in test")) as never;
  const unsupportedQuery = () =>
    Effect.die(new Error("Unsupported projection query in test")) as never;
  const providerService: ProviderServiceShape = {
    startSession: () => unsupported(),
    sendTurn: () => unsupported(),
    interruptTurn: () => unsupported(),
    respondToRequest: () => unsupported(),
    respondToUserInput: () => unsupported(),
    stopSession: () => unsupported(),
    listSessions: () => Effect.succeed([]),
    getCapabilities: () => Effect.succeed({ sessionModelSwitch: "in-session" }),
    getInstanceInfo: (instanceId) =>
      Effect.succeed({
        instanceId,
        driverKind: ProviderDriverKind.make("codex"),
        displayName: undefined,
        enabled: true,
        continuationIdentity: {
          driverKind: ProviderDriverKind.make("codex"),
          continuationKey: `codex:instance:${instanceId}`,
        },
      }),
    rollbackConversation: () => unsupported(),
    streamEvents: Stream.fromIterable(events),
  };
  const projectionSnapshotQuery: ProjectionSnapshotQueryShape = {
    getCommandReadModel: () => unsupportedQuery(),
    getSnapshot: () => unsupportedQuery(),
    getShellSnapshot: () => unsupportedQuery(),
    getArchivedShellSnapshot: () => unsupportedQuery(),
    getSnapshotSequence: () => unsupportedQuery(),
    getCounts: () => unsupportedQuery(),
    getActiveProjectByWorkspaceRoot: () => unsupportedQuery(),
    getProjectShellById: () => unsupportedQuery(),
    getFirstActiveThreadIdByProjectId: () => unsupportedQuery(),
    getThreadCheckpointContext: () => unsupportedQuery(),
    getThreadShellById: (threadId) =>
      Effect.succeed(
        threadId === ThreadId.make("thread-1") ? Option.some(threadShell) : Option.none(),
      ),
    getThreadDetailById: () => unsupportedQuery(),
  };

  const layer = OpenPetsReactorLive.pipe(
    Layer.provide(Layer.succeed(ProviderService, providerService)),
    Layer.provide(Layer.succeed(ProjectionSnapshotQuery, projectionSnapshotQuery)),
    Layer.provide(
      Layer.succeed(OpenPetsBridge, {
        notify: (input) => Effect.sync(() => notifications.push(input)),
        getStatus: Effect.succeed(openPetsStatus),
        refreshStatus: Effect.succeed(openPetsStatus),
      }),
    ),
  );

  const run = <A, E>(effect: Effect.Effect<A, E, OpenPetsReactor>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)));

  return {
    notifications,
    run,
  };
}

describe("OpenPetsReactor", () => {
  it("maps turn lifecycle events to running and done notifications", async () => {
    const harness = makeHarness([
      makeEvent("turn.started", { model: "gpt-5.4" }),
      makeEvent("turn.completed", { state: "completed" }),
    ]);
    await harness.run(
      Effect.scoped(
        Effect.gen(function* () {
          const reactor = yield* OpenPetsReactor;
          yield* reactor.start();
          yield* drainFibers;
          yield* reactor.drain;
        }),
      ),
    );

    expect(harness.notifications.map((notification) => notification.status)).toEqual([
      "running",
      "done",
    ]);
    expect(harness.notifications[0]?.key).toBe("thread-1");
    expect(harness.notifications[0]?.title).toBe("Improve OpenPets sync");
    expect(harness.notifications[1]?.text).toBe("Completed.");
  });

  it("maps approval and user-input events to review, waiting, and running", async () => {
    const harness = makeHarness([
      makeEvent("request.opened", {
        requestType: "exec_command_approval",
      }),
      makeEvent("user-input.requested", {
        questions: [
          {
            id: "q1",
            header: "Decision",
            question: "Pick one.",
            options: [{ label: "Yes", description: "Continue." }],
          },
        ],
      }),
      makeEvent("request.resolved", {
        requestType: "exec_command_approval",
        decision: "approved",
      }),
    ]);
    await harness.run(
      Effect.scoped(
        Effect.gen(function* () {
          const reactor = yield* OpenPetsReactor;
          yield* reactor.start();
          yield* drainFibers;
          yield* reactor.drain;
        }),
      ),
    );

    expect(harness.notifications.map((notification) => notification.status)).toEqual([
      "review",
      "waiting",
      "running",
    ]);
    expect(harness.notifications[0]?.text).toBe("Approval needed: exec command approval.");
    expect(harness.notifications[2]?.text).toBe("Back to work.");
  });

  it("uses assistant and reasoning summary deltas as live chat context", async () => {
    const harness = makeHarness([
      makeEvent("content.delta", {
        streamKind: "reasoning_summary_text",
        delta: "Checking the code path before editing the reactor.",
      }),
      makeEvent("content.delta", {
        streamKind: "assistant_text",
        delta: "I found the missing title lookup and will wire it into the pet notification.",
      }),
    ]);
    await harness.run(
      Effect.scoped(
        Effect.gen(function* () {
          const reactor = yield* OpenPetsReactor;
          yield* reactor.start();
          yield* drainFibers;
          yield* reactor.drain;
        }),
      ),
    );

    expect(harness.notifications.map((notification) => notification.text)).toEqual([
      "Thinking: Checking the code path before editing the reactor.",
      "Codex: I found the missing title lookup and will wire it into the pet notification.",
    ]);
  });

  it("maps failures and interruptions to failed", async () => {
    expect(
      OpenPetsReactorInternals.eventToNotification(
        makeEvent("turn.completed", {
          state: "failed",
          errorMessage: "Tests failed.",
        }),
      ),
    ).toMatchObject({
      status: "failed",
      text: "Tests failed.",
    });

    expect(
      OpenPetsReactorInternals.eventToNotification(
        makeEvent("turn.aborted", {
          reason: "Interrupted by user.",
        }),
      ),
    ).toMatchObject({
      status: "failed",
      text: "Interrupted by user.",
    });
  });

  it("uses request id as fallback when an event has no turn id", () => {
    const event = makeEvent(
      "request.opened",
      {
        requestType: "exec_command_approval",
      },
      {
        turnId: undefined,
        requestId: RuntimeRequestId.make("request-1"),
      },
    );

    expect(OpenPetsReactorInternals.notificationKey(event)).toBe("thread-1");
  });
});
