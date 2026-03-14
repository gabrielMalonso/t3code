import {
  DEFAULT_MODEL_BY_PROVIDER,
  ProjectId,
  SubThreadId,
  ThreadId,
  TurnId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { markThreadUnread, reorderProjects, syncServerReadModel, type AppState } from "./store";
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type SubThread,
  type Thread,
} from "./types";

function makeSubThread(overrides: Partial<SubThread> = {}): SubThread {
  return {
    id: SubThreadId.makeUnsafe("sub-thread-1"),
    threadId: ThreadId.makeUnsafe("thread-1"),
    title: "Main",
    model: "gpt-5-codex",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    proposedPlans: [],
    latestTurn: null,
    turnDiffSummaries: [],
    activities: [],
    createdAt: "2026-02-13T00:00:00.000Z",
    ...overrides,
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  const subThread = makeSubThread();
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    error: null,
    createdAt: "2026-02-13T00:00:00.000Z",
    branch: null,
    worktreePath: null,
    sourceThreadId: null,
    implementationThreadId: null,
    subThreads: [subThread],
    activeSubThreadId: subThread.id,
    ...overrides,
  };
}

function makeState(thread: Thread): AppState {
  return {
    projects: [
      {
        id: ProjectId.makeUnsafe("project-1"),
        name: "Project",
        cwd: "/tmp/project",
        model: "gpt-5-codex",
        expanded: true,
        scripts: [],
      },
    ],
    threads: [thread],
    threadsHydrated: true,
  };
}

function makeReadModelSubThread(
  overrides: Partial<OrchestrationReadModel["threads"][number]["subThreads"][number]> = {},
) {
  return {
    id: SubThreadId.makeUnsafe("sub-thread-1"),
    threadId: ThreadId.makeUnsafe("thread-1"),
    title: "Main",
    model: "gpt-5.3-codex",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    latestTurn: null,
    createdAt: "2026-02-27T00:00:00.000Z",
    updatedAt: "2026-02-27T00:00:00.000Z",
    deletedAt: null,
    messages: [],
    activities: [],
    proposedPlans: [],
    checkpoints: [],
    session: null,
    ...overrides,
  };
}

function makeReadModelThread(overrides: Partial<OrchestrationReadModel["threads"][number]> = {}) {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    branch: null,
    worktreePath: null,
    createdAt: "2026-02-27T00:00:00.000Z",
    updatedAt: "2026-02-27T00:00:00.000Z",
    deletedAt: null,
    sourceThreadId: null,
    implementationThreadId: null,
    subThreads: [makeReadModelSubThread()],
    activeSubThreadId: SubThreadId.makeUnsafe("sub-thread-1"),
    ...overrides,
  } satisfies OrchestrationReadModel["threads"][number];
}

function makeReadModel(thread: OrchestrationReadModel["threads"][number]): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    updatedAt: "2026-02-27T00:00:00.000Z",
    projects: [
      {
        id: ProjectId.makeUnsafe("project-1"),
        title: "Project",
        workspaceRoot: "/tmp/project",
        defaultModel: "gpt-5.3-codex",
        createdAt: "2026-02-27T00:00:00.000Z",
        updatedAt: "2026-02-27T00:00:00.000Z",
        deletedAt: null,
        scripts: [],
      },
    ],
    threads: [thread],
  };
}

function makeReadModelProject(
  overrides: Partial<OrchestrationReadModel["projects"][number]>,
): OrchestrationReadModel["projects"][number] {
  return {
    id: ProjectId.makeUnsafe("project-1"),
    title: "Project",
    workspaceRoot: "/tmp/project",
    defaultModel: "gpt-5.3-codex",
    createdAt: "2026-02-27T00:00:00.000Z",
    updatedAt: "2026-02-27T00:00:00.000Z",
    deletedAt: null,
    scripts: [],
    ...overrides,
  };
}

describe("store pure functions", () => {
  it("markThreadUnread moves lastVisitedAt before completion for a completed thread", () => {
    const latestTurnCompletedAt = "2026-02-25T12:30:00.000Z";
    const initialState = makeState(
      makeThread({
        subThreads: [
          makeSubThread({
            latestTurn: {
              turnId: TurnId.makeUnsafe("turn-1"),
              state: "completed",
              requestedAt: "2026-02-25T12:28:00.000Z",
              startedAt: "2026-02-25T12:28:30.000Z",
              completedAt: latestTurnCompletedAt,
              assistantMessageId: null,
            },
          }),
        ],
        lastVisitedAt: "2026-02-25T12:35:00.000Z",
      }),
    );

    const next = markThreadUnread(initialState, ThreadId.makeUnsafe("thread-1"));

    const updatedThread = next.threads[0];
    expect(updatedThread).toBeDefined();
    expect(updatedThread?.lastVisitedAt).toBe("2026-02-25T12:29:59.999Z");
    expect(Date.parse(updatedThread?.lastVisitedAt ?? "")).toBeLessThan(
      Date.parse(latestTurnCompletedAt),
    );
  });

  it("markThreadUnread does not change a thread without a completed turn", () => {
    const initialState = makeState(
      makeThread({
        subThreads: [makeSubThread({ latestTurn: null })],
        lastVisitedAt: "2026-02-25T12:35:00.000Z",
      }),
    );

    const next = markThreadUnread(initialState, ThreadId.makeUnsafe("thread-1"));

    expect(next).toEqual(initialState);
  });

  it("reorderProjects moves a project to a target index", () => {
    const project1 = ProjectId.makeUnsafe("project-1");
    const project2 = ProjectId.makeUnsafe("project-2");
    const project3 = ProjectId.makeUnsafe("project-3");
    const state: AppState = {
      projects: [
        {
          id: project1,
          name: "Project 1",
          cwd: "/tmp/project-1",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
        {
          id: project2,
          name: "Project 2",
          cwd: "/tmp/project-2",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
        {
          id: project3,
          name: "Project 3",
          cwd: "/tmp/project-3",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
      ],
      threads: [],
      threadsHydrated: true,
    };

    const next = reorderProjects(state, project1, project3);

    expect(next.projects.map((project) => project.id)).toEqual([project2, project3, project1]);
  });
});

describe("store read model sync", () => {
  it("infers the Claude provider from a Claude model without an active session", () => {
    const initialState = makeState(makeThread());
    const readModel = makeReadModel(
      makeReadModelThread({
        subThreads: [makeReadModelSubThread({ model: "claude-opus-4-6" })],
      }),
    );

    const next = syncServerReadModel(initialState, readModel);

    const activeSub = next.threads[0]?.subThreads[0];
    expect(activeSub?.model).toBe("claude-opus-4-6");
  });

  it("preserves a Claude session provider from the read model", () => {
    const initialState = makeState(makeThread());
    const readModel = makeReadModel(
      makeReadModelThread({
        subThreads: [
          makeReadModelSubThread({
            model: "claude-sonnet-4-6",
            session: {
              threadId: ThreadId.makeUnsafe("thread-1"),
              status: "ready",
              providerName: "claudeCode",
              runtimeMode: DEFAULT_RUNTIME_MODE,
              activeTurnId: null,
              lastError: null,
              updatedAt: "2026-02-27T00:00:00.000Z",
            },
          }),
        ],
      }),
    );

    const next = syncServerReadModel(initialState, readModel);

    const activeSub = next.threads[0]?.subThreads[0];
    expect(activeSub?.model).toBe("claude-sonnet-4-6");
    expect(activeSub?.session?.provider).toBe("claudeCode");
  });

  it("preserves Claude project default models from the read model", () => {
    const initialState: AppState = {
      projects: [],
      threads: [],
      threadsHydrated: true,
    };
    const readModel: OrchestrationReadModel = {
      snapshotSequence: 1,
      updatedAt: "2026-02-27T00:00:00.000Z",
      projects: [
        makeReadModelProject({
          defaultModel: "claude-sonnet-4-6",
        }),
      ],
      threads: [],
    };

    const next = syncServerReadModel(initialState, readModel);

    expect(next.projects[0]?.model).toBe("claude-sonnet-4-6");
  });

  it("preserves the current project order when syncing incoming read model updates", () => {
    const project1 = ProjectId.makeUnsafe("project-1");
    const project2 = ProjectId.makeUnsafe("project-2");
    const project3 = ProjectId.makeUnsafe("project-3");
    const initialState: AppState = {
      projects: [
        {
          id: project2,
          name: "Project 2",
          cwd: "/tmp/project-2",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
        {
          id: project1,
          name: "Project 1",
          cwd: "/tmp/project-1",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
      ],
      threads: [],
      threadsHydrated: true,
    };
    const readModel: OrchestrationReadModel = {
      snapshotSequence: 2,
      updatedAt: "2026-02-27T00:00:00.000Z",
      projects: [
        makeReadModelProject({
          id: project1,
          title: "Project 1",
          workspaceRoot: "/tmp/project-1",
        }),
        makeReadModelProject({
          id: project2,
          title: "Project 2",
          workspaceRoot: "/tmp/project-2",
        }),
        makeReadModelProject({
          id: project3,
          title: "Project 3",
          workspaceRoot: "/tmp/project-3",
        }),
      ],
      threads: [],
    };

    const next = syncServerReadModel(initialState, readModel);

    expect(next.projects.map((project) => project.id)).toEqual([project2, project1, project3]);
  });
});
