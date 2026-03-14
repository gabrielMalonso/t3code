import { Fragment, type ReactNode, createElement, useEffect } from "react";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ProviderKind,
  ThreadId,
  type OrchestrationReadModel,
  type OrchestrationSessionStatus,
} from "@t3tools/contracts";
import {
  getModelOptions,
  inferProviderFromModel,
  normalizeModelSlug,
  resolveModelSlugForProvider,
} from "@t3tools/shared/model";
import { create } from "zustand";
import { type ChatMessage, type Project, type SubThread, type Thread } from "./types";
import { Debouncer } from "@tanstack/react-pacer";

// ── State ────────────────────────────────────────────────────────────

export interface AppState {
  projects: Project[];
  threads: Thread[];
  threadsHydrated: boolean;
}

const PERSISTED_STATE_KEY = "t3code:renderer-state:v8";
const LEGACY_PERSISTED_STATE_KEYS = [
  "t3code:renderer-state:v7",
  "t3code:renderer-state:v6",
  "t3code:renderer-state:v5",
  "t3code:renderer-state:v4",
  "t3code:renderer-state:v3",
  "codething:renderer-state:v4",
  "codething:renderer-state:v3",
  "codething:renderer-state:v2",
  "codething:renderer-state:v1",
] as const;

const initialState: AppState = {
  projects: [],
  threads: [],
  threadsHydrated: false,
};
const persistedExpandedProjectCwds = new Set<string>();
const persistedProjectOrderCwds: string[] = [];

// ── Persist helpers ──────────────────────────────────────────────────

function readPersistedState(): AppState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as {
      expandedProjectCwds?: string[];
      projectOrderCwds?: string[];
    };
    persistedExpandedProjectCwds.clear();
    persistedProjectOrderCwds.length = 0;
    for (const cwd of parsed.expandedProjectCwds ?? []) {
      if (typeof cwd === "string" && cwd.length > 0) {
        persistedExpandedProjectCwds.add(cwd);
      }
    }
    for (const cwd of parsed.projectOrderCwds ?? []) {
      if (typeof cwd === "string" && cwd.length > 0 && !persistedProjectOrderCwds.includes(cwd)) {
        persistedProjectOrderCwds.push(cwd);
      }
    }
    return { ...initialState };
  } catch {
    return initialState;
  }
}

let legacyKeysCleanedUp = false;

function persistState(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PERSISTED_STATE_KEY,
      JSON.stringify({
        expandedProjectCwds: state.projects
          .filter((project) => project.expanded)
          .map((project) => project.cwd),
        projectOrderCwds: state.projects.map((project) => project.cwd),
      }),
    );
    if (!legacyKeysCleanedUp) {
      legacyKeysCleanedUp = true;
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    }
  } catch {
    // Ignore quota/storage errors to avoid breaking chat UX.
  }
}
const debouncedPersistState = new Debouncer(persistState, { wait: 500 });

// ── Pure helpers ──────────────────────────────────────────────────────

function updateThread(
  threads: Thread[],
  threadId: ThreadId,
  updater: (t: Thread) => Thread,
): Thread[] {
  let changed = false;
  const next = threads.map((t) => {
    if (t.id !== threadId) return t;
    const updated = updater(t);
    if (updated !== t) changed = true;
    return updated;
  });
  return changed ? next : threads;
}

function mapProjectsFromReadModel(
  incoming: OrchestrationReadModel["projects"],
  previous: Project[],
): Project[] {
  const previousById = new Map(previous.map((project) => [project.id, project] as const));
  const previousByCwd = new Map(previous.map((project) => [project.cwd, project] as const));
  const previousOrderById = new Map(previous.map((project, index) => [project.id, index] as const));
  const previousOrderByCwd = new Map(
    previous.map((project, index) => [project.cwd, index] as const),
  );
  const persistedOrderByCwd = new Map(
    persistedProjectOrderCwds.map((cwd, index) => [cwd, index] as const),
  );
  const usePersistedOrder = previous.length === 0;

  const mappedProjects = incoming.map((project) => {
    const existing = previousById.get(project.id) ?? previousByCwd.get(project.workspaceRoot);
    return {
      id: project.id,
      name: project.title,
      cwd: project.workspaceRoot,
      model:
        existing?.model ??
        resolveModelSlugForProvider(
          inferProviderFromModel(project.defaultModel) ?? "codex",
          project.defaultModel ?? DEFAULT_MODEL_BY_PROVIDER.codex,
        ),
      expanded:
        existing?.expanded ??
        (persistedExpandedProjectCwds.size > 0
          ? persistedExpandedProjectCwds.has(project.workspaceRoot)
          : true),
      scripts: project.scripts.map((script) => ({ ...script })),
    } satisfies Project;
  });

  return mappedProjects
    .map((project, incomingIndex) => {
      const previousIndex =
        previousOrderById.get(project.id) ?? previousOrderByCwd.get(project.cwd);
      const persistedIndex = usePersistedOrder ? persistedOrderByCwd.get(project.cwd) : undefined;
      const orderIndex =
        previousIndex ??
        persistedIndex ??
        (usePersistedOrder ? persistedProjectOrderCwds.length : previous.length) + incomingIndex;
      return { project, incomingIndex, orderIndex };
    })
    .toSorted((a, b) => {
      const byOrder = a.orderIndex - b.orderIndex;
      if (byOrder !== 0) return byOrder;
      return a.incomingIndex - b.incomingIndex;
    })
    .map((entry) => entry.project);
}

function toLegacySessionStatus(
  status: OrchestrationSessionStatus,
): "connecting" | "ready" | "running" | "error" | "closed" {
  switch (status) {
    case "starting":
      return "connecting";
    case "running":
      return "running";
    case "error":
      return "error";
    case "ready":
    case "interrupted":
      return "ready";
    case "idle":
    case "stopped":
      return "closed";
  }
}

function normalizeProviderName(providerName: string | null): ProviderKind | null {
  return providerName === "codex" || providerName === "claudeCode" || providerName === "cursor"
    ? providerName
    : null;
}

const CODEX_MODEL_SLUGS = new Set<string>(getModelOptions("codex").map((option) => option.slug));

function inferProviderForThreadModel(input: {
  readonly model: string;
  readonly sessionProviderName: string | null;
}): ProviderKind {
  const sessionProvider = normalizeProviderName(input.sessionProviderName);
  if (sessionProvider) {
    return sessionProvider;
  }
  const inferredProvider = inferProviderFromModel(input.model);
  if (inferredProvider) {
    return inferredProvider;
  }
  const normalizedCodex = normalizeModelSlug(input.model, "codex");
  if (normalizedCodex && CODEX_MODEL_SLUGS.has(normalizedCodex)) {
    return "codex";
  }
  return "codex";
}

function resolveWsHttpOrigin(): string {
  if (typeof window === "undefined") return "";
  const bridgeWsUrl = window.desktopBridge?.getWsUrl?.();
  const envWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
  const wsCandidate =
    typeof bridgeWsUrl === "string" && bridgeWsUrl.length > 0
      ? bridgeWsUrl
      : typeof envWsUrl === "string" && envWsUrl.length > 0
        ? envWsUrl
        : null;
  if (!wsCandidate) return window.location.origin;
  try {
    const wsUrl = new URL(wsCandidate);
    const protocol =
      wsUrl.protocol === "wss:" ? "https:" : wsUrl.protocol === "ws:" ? "http:" : wsUrl.protocol;
    return `${protocol}//${wsUrl.host}`;
  } catch {
    return window.location.origin;
  }
}

function toAttachmentPreviewUrl(rawUrl: string): string {
  if (rawUrl.startsWith("/")) {
    return `${resolveWsHttpOrigin()}${rawUrl}`;
  }
  return rawUrl;
}

function attachmentPreviewRoutePath(attachmentId: string): string {
  return `/attachments/${encodeURIComponent(attachmentId)}`;
}

// ── Pure state transition functions ────────────────────────────────────

function mapSubThreadSession(sub: {
  session: OrchestrationReadModel["threads"][number]["subThreads"][number]["session"];
  model: string;
}) {
  if (!sub.session) return null;
  return {
    provider:
      normalizeProviderName(sub.session.providerName) ??
      inferProviderForThreadModel({
        model: sub.model,
        sessionProviderName: sub.session.providerName,
      }),
    status: toLegacySessionStatus(sub.session.status),
    orchestrationStatus: sub.session.status,
    activeTurnId: sub.session.activeTurnId ?? undefined,
    createdAt: sub.session.updatedAt,
    updatedAt: sub.session.updatedAt,
    ...(sub.session.lastError ? { lastError: sub.session.lastError } : {}),
    ...(sub.session.skills ? { skills: [...sub.session.skills] } : {}),
    ...(sub.session.slashCommands ? { slashCommands: [...sub.session.slashCommands] } : {}),
  };
}

function mapSubThreadMessages(
  messages: OrchestrationReadModel["threads"][number]["subThreads"][number]["messages"],
): ChatMessage[] {
  return messages.map((message) => {
    const attachments = message.attachments?.map((attachment) => ({
      type: "image" as const,
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      previewUrl: toAttachmentPreviewUrl(attachmentPreviewRoutePath(attachment.id)),
    }));
    const normalizedMessage: ChatMessage = {
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
      streaming: message.streaming,
      ...(message.streaming ? {} : { completedAt: message.updatedAt }),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    };
    return normalizedMessage;
  });
}

export function syncServerReadModel(state: AppState, readModel: OrchestrationReadModel): AppState {
  const projects = mapProjectsFromReadModel(
    readModel.projects.filter((project) => project.deletedAt === null),
    state.projects,
  );
  const existingThreadById = new Map(state.threads.map((thread) => [thread.id, thread] as const));
  const threads = readModel.threads
    .filter((thread) => thread.deletedAt === null)
    .map((thread) => {
      const existing = existingThreadById.get(thread.id);

      const subThreads: SubThread[] = thread.subThreads
        .filter((sub) => sub.deletedAt === null)
        .map((sub) => ({
          id: sub.id,
          threadId: sub.threadId,
          title: sub.title,
          model: resolveModelSlugForProvider(
            inferProviderForThreadModel({
              model: sub.model,
              sessionProviderName: sub.session?.providerName ?? null,
            }),
            sub.model,
          ),
          runtimeMode: sub.runtimeMode,
          interactionMode: sub.interactionMode,
          session: mapSubThreadSession(sub),
          messages: mapSubThreadMessages(sub.messages),
          proposedPlans: sub.proposedPlans.map((proposedPlan) => ({
            id: proposedPlan.id,
            turnId: proposedPlan.turnId,
            planMarkdown: proposedPlan.planMarkdown,
            createdAt: proposedPlan.createdAt,
            updatedAt: proposedPlan.updatedAt,
          })),
          latestTurn: sub.latestTurn,
          turnDiffSummaries: sub.checkpoints.map((checkpoint) => ({
            turnId: checkpoint.turnId,
            completedAt: checkpoint.completedAt,
            status: checkpoint.status,
            assistantMessageId: checkpoint.assistantMessageId ?? undefined,
            checkpointTurnCount: checkpoint.checkpointTurnCount,
            checkpointRef: checkpoint.checkpointRef,
            files: checkpoint.files.map((file) => ({ ...file })),
          })),
          activities: sub.activities.map((activity) => ({ ...activity })),
          createdAt: sub.createdAt,
        }));

      const activeSubThreadId = thread.activeSubThreadId ?? subThreads[0]?.id ?? null;
      const activeSub = subThreads.find((s) => s.id === activeSubThreadId) ?? subThreads[0];

      return {
        id: thread.id,
        codexThreadId: null,
        projectId: thread.projectId,
        title: thread.title,
        error: activeSub?.session?.lastError ?? null,
        createdAt: thread.createdAt,
        lastVisitedAt: existing?.lastVisitedAt ?? thread.updatedAt,
        branch: thread.branch,
        worktreePath: thread.worktreePath,
        sourceThreadId: thread.sourceThreadId ?? null,
        implementationThreadId: thread.implementationThreadId ?? null,
        subThreads,
        activeSubThreadId,
      };
    });
  return {
    ...state,
    projects,
    threads,
    threadsHydrated: true,
  };
}

export function markThreadVisited(
  state: AppState,
  threadId: ThreadId,
  visitedAt?: string,
): AppState {
  const at = visitedAt ?? new Date().toISOString();
  const visitedAtMs = Date.parse(at);
  const threads = updateThread(state.threads, threadId, (thread) => {
    const previousVisitedAtMs = thread.lastVisitedAt ? Date.parse(thread.lastVisitedAt) : NaN;
    if (
      Number.isFinite(previousVisitedAtMs) &&
      Number.isFinite(visitedAtMs) &&
      previousVisitedAtMs >= visitedAtMs
    ) {
      return thread;
    }
    return { ...thread, lastVisitedAt: at };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function markThreadUnread(state: AppState, threadId: ThreadId): AppState {
  const threads = updateThread(state.threads, threadId, (thread) => {
    const activeSub =
      thread.subThreads.find((s) => s.id === thread.activeSubThreadId) ?? thread.subThreads[0];
    const latestTurn = activeSub?.latestTurn ?? null;
    if (!latestTurn?.completedAt) return thread;
    const latestTurnCompletedAtMs = Date.parse(latestTurn.completedAt);
    if (Number.isNaN(latestTurnCompletedAtMs)) return thread;
    const unreadVisitedAt = new Date(latestTurnCompletedAtMs - 1).toISOString();
    if (thread.lastVisitedAt === unreadVisitedAt) return thread;
    return { ...thread, lastVisitedAt: unreadVisitedAt };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function toggleProject(state: AppState, projectId: Project["id"]): AppState {
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === projectId ? { ...p, expanded: !p.expanded } : p)),
  };
}

export function setProjectExpanded(
  state: AppState,
  projectId: Project["id"],
  expanded: boolean,
): AppState {
  let changed = false;
  const projects = state.projects.map((p) => {
    if (p.id !== projectId || p.expanded === expanded) return p;
    changed = true;
    return { ...p, expanded };
  });
  return changed ? { ...state, projects } : state;
}

export function reorderProjects(
  state: AppState,
  draggedProjectId: Project["id"],
  targetProjectId: Project["id"],
): AppState {
  if (draggedProjectId === targetProjectId) return state;
  const draggedIndex = state.projects.findIndex((project) => project.id === draggedProjectId);
  const targetIndex = state.projects.findIndex((project) => project.id === targetProjectId);
  if (draggedIndex < 0 || targetIndex < 0) return state;
  const projects = [...state.projects];
  const [draggedProject] = projects.splice(draggedIndex, 1);
  if (!draggedProject) return state;
  projects.splice(targetIndex, 0, draggedProject);
  return { ...state, projects };
}

export function setError(state: AppState, threadId: ThreadId, error: string | null): AppState {
  const threads = updateThread(state.threads, threadId, (t) => {
    if (t.error === error) return t;
    return { ...t, error };
  });
  return threads === state.threads ? state : { ...state, threads };
}

export function setThreadBranch(
  state: AppState,
  threadId: ThreadId,
  branch: string | null,
  worktreePath: string | null,
): AppState {
  const threads = updateThread(state.threads, threadId, (t) => {
    if (t.branch === branch && t.worktreePath === worktreePath) return t;
    const cwdChanged = t.worktreePath !== worktreePath;
    return {
      ...t,
      branch,
      worktreePath,
      ...(cwdChanged ? { subThreads: t.subThreads.map((sub) => ({ ...sub, session: null })) } : {}),
    };
  });
  return threads === state.threads ? state : { ...state, threads };
}

// ── Zustand store ────────────────────────────────────────────────────

interface AppStore extends AppState {
  syncServerReadModel: (readModel: OrchestrationReadModel) => void;
  markThreadVisited: (threadId: ThreadId, visitedAt?: string) => void;
  markThreadUnread: (threadId: ThreadId) => void;
  toggleProject: (projectId: Project["id"]) => void;
  setProjectExpanded: (projectId: Project["id"], expanded: boolean) => void;
  reorderProjects: (draggedProjectId: Project["id"], targetProjectId: Project["id"]) => void;
  setError: (threadId: ThreadId, error: string | null) => void;
  setThreadBranch: (threadId: ThreadId, branch: string | null, worktreePath: string | null) => void;
}

export const useStore = create<AppStore>((set) => ({
  ...readPersistedState(),
  syncServerReadModel: (readModel) => set((state) => syncServerReadModel(state, readModel)),
  markThreadVisited: (threadId, visitedAt) =>
    set((state) => markThreadVisited(state, threadId, visitedAt)),
  markThreadUnread: (threadId) => set((state) => markThreadUnread(state, threadId)),
  toggleProject: (projectId) => set((state) => toggleProject(state, projectId)),
  setProjectExpanded: (projectId, expanded) =>
    set((state) => setProjectExpanded(state, projectId, expanded)),
  reorderProjects: (draggedProjectId, targetProjectId) =>
    set((state) => reorderProjects(state, draggedProjectId, targetProjectId)),
  setError: (threadId, error) => set((state) => setError(state, threadId, error)),
  setThreadBranch: (threadId, branch, worktreePath) =>
    set((state) => setThreadBranch(state, threadId, branch, worktreePath)),
}));

// Persist state changes with debouncing to avoid localStorage thrashing
useStore.subscribe((state) => debouncedPersistState.maybeExecute(state));

// Flush pending writes synchronously before page unload to prevent data loss.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    debouncedPersistState.flush();
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    persistState(useStore.getState());
  }, []);
  return createElement(Fragment, null, children);
}
