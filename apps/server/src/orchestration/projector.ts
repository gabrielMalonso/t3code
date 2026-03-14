import type {
  OrchestrationEvent,
  OrchestrationReadModel,
  OrchestrationSubThread,
  SubThreadId,
  ThreadId,
} from "@t3tools/contracts";
import {
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationSession,
  OrchestrationThread,
} from "@t3tools/contracts";
import { Effect, Schema } from "effect";

import { toProjectorDecodeError, type OrchestrationProjectorDecodeError } from "./Errors.ts";
import {
  MessageSentPayloadSchema,
  ProjectCreatedPayload,
  ProjectDeletedPayload,
  ProjectMetaUpdatedPayload,
  SubThreadCreatedPayload,
  SubThreadDeletedPayload,
  SubThreadMetaUpdatedPayload,
  ThreadActiveSubThreadSetPayload,
  ThreadActivityAppendedPayload,
  ThreadCreatedPayload,
  ThreadDeletedPayload,
  ThreadInteractionModeSetPayload,
  ThreadMetaUpdatedPayload,
  ThreadProposedPlanUpsertedPayload,
  ThreadRuntimeModeSetPayload,
  ThreadRevertedPayload,
  ThreadSessionSetPayload,
  ThreadTurnDiffCompletedPayload,
} from "./Schemas.ts";

type ThreadPatch = Partial<Omit<OrchestrationThread, "id" | "projectId">>;
type SubThreadPatch = Partial<Omit<OrchestrationSubThread, "id" | "threadId">>;
const MAX_THREAD_MESSAGES = 2_000;
const MAX_THREAD_CHECKPOINTS = 500;

function checkpointStatusToLatestTurnState(status: "ready" | "missing" | "error") {
  if (status === "error") return "error" as const;
  if (status === "missing") return "interrupted" as const;
  return "completed" as const;
}

function updateThread(
  threads: ReadonlyArray<OrchestrationThread>,
  threadId: ThreadId,
  patch: ThreadPatch,
): OrchestrationThread[] {
  return threads.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread));
}

function updateSubThread(
  threads: ReadonlyArray<OrchestrationThread>,
  threadId: ThreadId,
  subThreadId: SubThreadId,
  patch: SubThreadPatch | ((sub: OrchestrationSubThread) => OrchestrationSubThread),
): OrchestrationThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId) return thread;
    return {
      ...thread,
      subThreads: thread.subThreads.map((sub) => {
        if (sub.id !== subThreadId) return sub;
        return typeof patch === "function" ? patch(sub) : { ...sub, ...patch };
      }),
    };
  });
}

function resolveEventSubThreadId(
  threads: ReadonlyArray<OrchestrationThread>,
  threadId: ThreadId,
  explicitSubThreadId?: SubThreadId,
): SubThreadId | undefined {
  if (explicitSubThreadId) return explicitSubThreadId;
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) return undefined;
  return thread.activeSubThreadId ?? thread.subThreads[0]?.id ?? undefined;
}

function decodeForEvent<A>(
  schema: Schema.Schema<A>,
  value: unknown,
  eventType: OrchestrationEvent["type"],
  field: string,
): Effect.Effect<A, OrchestrationProjectorDecodeError> {
  return Effect.try({
    try: () => Schema.decodeUnknownSync(schema as any)(value),
    catch: (error) => toProjectorDecodeError(`${eventType}:${field}`)(error as Schema.SchemaError),
  });
}

function retainThreadMessagesAfterRevert(
  messages: ReadonlyArray<OrchestrationMessage>,
  retainedTurnIds: ReadonlySet<string>,
  turnCount: number,
): ReadonlyArray<OrchestrationMessage> {
  const retainedMessageIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "system") {
      retainedMessageIds.add(message.id);
      continue;
    }
    if (message.turnId !== null && retainedTurnIds.has(message.turnId)) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedUserCount = messages.filter(
    (message) => message.role === "user" && retainedMessageIds.has(message.id),
  ).length;
  const missingUserCount = Math.max(0, turnCount - retainedUserCount);
  if (missingUserCount > 0) {
    const fallbackUserMessages = messages
      .filter(
        (message) =>
          message.role === "user" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === null || retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingUserCount);
    for (const message of fallbackUserMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedAssistantCount = messages.filter(
    (message) => message.role === "assistant" && retainedMessageIds.has(message.id),
  ).length;
  const missingAssistantCount = Math.max(0, turnCount - retainedAssistantCount);
  if (missingAssistantCount > 0) {
    const fallbackAssistantMessages = messages
      .filter(
        (message) =>
          message.role === "assistant" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === null || retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingAssistantCount);
    for (const message of fallbackAssistantMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  return messages.filter((message) => retainedMessageIds.has(message.id));
}

function retainThreadActivitiesAfterRevert(
  activities: ReadonlyArray<OrchestrationSubThread["activities"][number]>,
  retainedTurnIds: ReadonlySet<string>,
): ReadonlyArray<OrchestrationSubThread["activities"][number]> {
  return activities.filter(
    (activity) => activity.turnId === null || retainedTurnIds.has(activity.turnId),
  );
}

function retainThreadProposedPlansAfterRevert(
  proposedPlans: ReadonlyArray<OrchestrationSubThread["proposedPlans"][number]>,
  retainedTurnIds: ReadonlySet<string>,
): ReadonlyArray<OrchestrationSubThread["proposedPlans"][number]> {
  return proposedPlans.filter(
    (proposedPlan) => proposedPlan.turnId === null || retainedTurnIds.has(proposedPlan.turnId),
  );
}

function compareThreadActivities(
  left: OrchestrationSubThread["activities"][number],
  right: OrchestrationSubThread["activities"][number],
): number {
  if (left.sequence !== undefined && right.sequence !== undefined) {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
  } else if (left.sequence !== undefined) {
    return 1;
  } else if (right.sequence !== undefined) {
    return -1;
  }

  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

export function createEmptyReadModel(nowIso: string): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [],
    updatedAt: nowIso,
  };
}

export function projectEvent(
  model: OrchestrationReadModel,
  event: OrchestrationEvent,
): Effect.Effect<OrchestrationReadModel, OrchestrationProjectorDecodeError> {
  const nextBase: OrchestrationReadModel = {
    ...model,
    snapshotSequence: event.sequence,
    updatedAt: event.occurredAt,
  };

  switch (event.type) {
    case "project.created":
      return decodeForEvent(ProjectCreatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => {
          const existing = nextBase.projects.find((entry) => entry.id === payload.projectId);
          const nextProject = {
            id: payload.projectId,
            title: payload.title,
            workspaceRoot: payload.workspaceRoot,
            defaultModel: payload.defaultModel,
            scripts: payload.scripts,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
            deletedAt: null,
          };

          return {
            ...nextBase,
            projects: existing
              ? nextBase.projects.map((entry) =>
                  entry.id === payload.projectId ? nextProject : entry,
                )
              : [...nextBase.projects, nextProject],
          };
        }),
      );

    case "project.meta-updated":
      return decodeForEvent(ProjectMetaUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? {
                  ...project,
                  ...(payload.title !== undefined ? { title: payload.title } : {}),
                  ...(payload.workspaceRoot !== undefined
                    ? { workspaceRoot: payload.workspaceRoot }
                    : {}),
                  ...(payload.defaultModel !== undefined
                    ? { defaultModel: payload.defaultModel }
                    : {}),
                  ...(payload.scripts !== undefined ? { scripts: payload.scripts } : {}),
                  updatedAt: payload.updatedAt,
                }
              : project,
          ),
        })),
      );

    case "project.deleted":
      return decodeForEvent(ProjectDeletedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? {
                  ...project,
                  deletedAt: payload.deletedAt,
                  updatedAt: payload.deletedAt,
                }
              : project,
          ),
        })),
      );

    case "thread.created":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadCreatedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread: OrchestrationThread = yield* decodeForEvent(
          OrchestrationThread,
          {
            id: payload.threadId,
            projectId: payload.projectId,
            title: payload.title,
            branch: payload.branch,
            worktreePath: payload.worktreePath,
            sourceThreadId: payload.sourceThreadId ?? null,
            implementationThreadId: null,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
            deletedAt: null,
            subThreads: [],
            activeSubThreadId: null,
          },
          event.type,
          "thread",
        );
        const existing = nextBase.threads.find((entry) => entry.id === thread.id);
        return {
          ...nextBase,
          threads: existing
            ? nextBase.threads.map((entry) => (entry.id === thread.id ? thread : entry))
            : [...nextBase.threads, thread],
        };
      });

    case "thread.deleted":
      return decodeForEvent(ThreadDeletedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            deletedAt: payload.deletedAt,
            updatedAt: payload.deletedAt,
          }),
        })),
      );

    case "thread.meta-updated":
      return decodeForEvent(ThreadMetaUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            ...(payload.title !== undefined ? { title: payload.title } : {}),
            ...(payload.branch !== undefined ? { branch: payload.branch } : {}),
            ...(payload.worktreePath !== undefined ? { worktreePath: payload.worktreePath } : {}),
            ...(payload.implementationThreadId !== undefined
              ? { implementationThreadId: payload.implementationThreadId }
              : {}),
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.sub-thread-created":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          SubThreadCreatedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) return nextBase;

        const newSubThread: OrchestrationSubThread = {
          id: payload.subThreadId,
          threadId: payload.threadId,
          title: payload.title,
          model: payload.model,
          runtimeMode: payload.runtimeMode,
          interactionMode: payload.interactionMode,
          latestTurn: null,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
          deletedAt: null,
          messages: [],
          proposedPlans: [],
          activities: [],
          checkpoints: [],
          session: null,
        };

        const isFirst = thread.subThreads.length === 0;
        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            subThreads: [...thread.subThreads, newSubThread],
            ...(isFirst ? { activeSubThreadId: payload.subThreadId } : {}),
            updatedAt: event.occurredAt,
          }),
        };
      });

    case "thread.sub-thread-deleted":
      return decodeForEvent(SubThreadDeletedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => {
          const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
          if (!thread) return nextBase;

          const remainingSubThreads = thread.subThreads.filter(
            (sub) => sub.id !== payload.subThreadId,
          );
          const activeSubThreadId =
            thread.activeSubThreadId === payload.subThreadId
              ? (remainingSubThreads[0]?.id ?? null)
              : thread.activeSubThreadId;

          return {
            ...nextBase,
            threads: updateThread(nextBase.threads, payload.threadId, {
              subThreads: remainingSubThreads,
              activeSubThreadId,
              updatedAt: event.occurredAt,
            }),
          };
        }),
      );

    case "thread.sub-thread-meta-updated":
      return decodeForEvent(SubThreadMetaUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateSubThread(nextBase.threads, payload.threadId, payload.subThreadId, {
            ...(payload.title !== undefined ? { title: payload.title } : {}),
            ...(payload.model !== undefined ? { model: payload.model } : {}),
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.active-sub-thread-set":
      return decodeForEvent(
        ThreadActiveSubThreadSetPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            activeSubThreadId: payload.subThreadId,
          }),
        })),
      );

    case "thread.runtime-mode-set":
      return decodeForEvent(ThreadRuntimeModeSetPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => {
          const subThreadId = resolveEventSubThreadId(
            nextBase.threads,
            payload.threadId,
            payload.subThreadId,
          );
          if (!subThreadId) return nextBase;
          return {
            ...nextBase,
            threads: updateSubThread(nextBase.threads, payload.threadId, subThreadId, {
              runtimeMode: payload.runtimeMode,
              updatedAt: payload.updatedAt,
            }),
          };
        }),
      );

    case "thread.interaction-mode-set":
      return decodeForEvent(
        ThreadInteractionModeSetPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => {
          const subThreadId = resolveEventSubThreadId(
            nextBase.threads,
            payload.threadId,
            payload.subThreadId,
          );
          if (!subThreadId) return nextBase;
          return {
            ...nextBase,
            threads: updateSubThread(nextBase.threads, payload.threadId, subThreadId, {
              interactionMode: payload.interactionMode,
              updatedAt: payload.updatedAt,
            }),
          };
        }),
      );

    case "thread.message-sent":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          MessageSentPayloadSchema,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const subThreadId = resolveEventSubThreadId(
          nextBase.threads,
          payload.threadId,
          payload.subThreadId,
        );
        if (!subThreadId) return nextBase;

        const message: OrchestrationMessage = yield* decodeForEvent(
          OrchestrationMessage,
          {
            id: payload.messageId,
            role: payload.role,
            text: payload.text,
            ...(payload.attachments !== undefined ? { attachments: payload.attachments } : {}),
            turnId: payload.turnId,
            streaming: payload.streaming,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
          },
          event.type,
          "message",
        );

        return {
          ...nextBase,
          threads: updateSubThread(nextBase.threads, payload.threadId, subThreadId, (sub) => {
            const existingMessage = sub.messages.find((entry) => entry.id === message.id);
            const messages = existingMessage
              ? sub.messages.map((entry) =>
                  entry.id === message.id
                    ? {
                        ...entry,
                        text: message.streaming
                          ? `${entry.text}${message.text}`
                          : message.text.length > 0
                            ? message.text
                            : entry.text,
                        streaming: message.streaming,
                        updatedAt: message.updatedAt,
                        turnId: message.turnId,
                        ...(message.attachments !== undefined
                          ? { attachments: message.attachments }
                          : {}),
                      }
                    : entry,
                )
              : [...sub.messages, message];
            return {
              ...sub,
              messages: messages.slice(-MAX_THREAD_MESSAGES),
              updatedAt: event.occurredAt,
            };
          }),
        };
      });

    case "thread.session-set":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadSessionSetPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const subThreadId = resolveEventSubThreadId(
          nextBase.threads,
          payload.threadId,
          payload.subThreadId,
        );
        if (!subThreadId) return nextBase;

        const session: OrchestrationSession = yield* decodeForEvent(
          OrchestrationSession,
          payload.session,
          event.type,
          "session",
        );

        return {
          ...nextBase,
          threads: updateSubThread(nextBase.threads, payload.threadId, subThreadId, (sub) => ({
            ...sub,
            session,
            latestTurn:
              session.status === "running" && session.activeTurnId !== null
                ? {
                    turnId: session.activeTurnId,
                    state: "running" as const,
                    requestedAt:
                      sub.latestTurn?.turnId === session.activeTurnId
                        ? sub.latestTurn.requestedAt
                        : session.updatedAt,
                    startedAt:
                      sub.latestTurn?.turnId === session.activeTurnId
                        ? (sub.latestTurn.startedAt ?? session.updatedAt)
                        : session.updatedAt,
                    completedAt: null,
                    assistantMessageId:
                      sub.latestTurn?.turnId === session.activeTurnId
                        ? sub.latestTurn.assistantMessageId
                        : null,
                  }
                : sub.latestTurn,
            updatedAt: event.occurredAt,
          })),
        };
      });

    case "thread.proposed-plan-upserted":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadProposedPlanUpsertedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const subThreadId = resolveEventSubThreadId(
          nextBase.threads,
          payload.threadId,
          payload.subThreadId,
        );
        if (!subThreadId) return nextBase;

        return {
          ...nextBase,
          threads: updateSubThread(nextBase.threads, payload.threadId, subThreadId, (sub) => {
            const proposedPlans = [
              ...sub.proposedPlans.filter((entry) => entry.id !== payload.proposedPlan.id),
              payload.proposedPlan,
            ]
              .toSorted(
                (left, right) =>
                  left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
              )
              .slice(-200);
            return { ...sub, proposedPlans, updatedAt: event.occurredAt };
          }),
        };
      });

    case "thread.turn-diff-completed":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadTurnDiffCompletedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const subThreadId = resolveEventSubThreadId(
          nextBase.threads,
          payload.threadId,
          payload.subThreadId,
        );
        if (!subThreadId) return nextBase;

        const checkpoint = yield* decodeForEvent(
          OrchestrationCheckpointSummary,
          {
            turnId: payload.turnId,
            checkpointTurnCount: payload.checkpointTurnCount,
            checkpointRef: payload.checkpointRef,
            status: payload.status,
            files: payload.files,
            assistantMessageId: payload.assistantMessageId,
            completedAt: payload.completedAt,
          },
          event.type,
          "checkpoint",
        );

        return {
          ...nextBase,
          threads: updateSubThread(nextBase.threads, payload.threadId, subThreadId, (sub) => {
            // Do not let a placeholder (status "missing") overwrite a checkpoint
            // that has already been captured with a real git ref (status "ready").
            const existing = sub.checkpoints.find((entry) => entry.turnId === checkpoint.turnId);
            if (existing && existing.status !== "missing" && checkpoint.status === "missing") {
              return sub;
            }

            const checkpoints = [
              ...sub.checkpoints.filter((entry) => entry.turnId !== checkpoint.turnId),
              checkpoint,
            ]
              .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
              .slice(-MAX_THREAD_CHECKPOINTS);

            return {
              ...sub,
              checkpoints,
              latestTurn: {
                turnId: payload.turnId,
                state: checkpointStatusToLatestTurnState(payload.status),
                requestedAt:
                  sub.latestTurn?.turnId === payload.turnId
                    ? sub.latestTurn.requestedAt
                    : payload.completedAt,
                startedAt:
                  sub.latestTurn?.turnId === payload.turnId
                    ? (sub.latestTurn.startedAt ?? payload.completedAt)
                    : payload.completedAt,
                completedAt: payload.completedAt,
                assistantMessageId: payload.assistantMessageId,
              },
              updatedAt: event.occurredAt,
            };
          }),
        };
      });

    case "thread.reverted":
      return decodeForEvent(ThreadRevertedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => {
          const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
          if (!thread) {
            return nextBase;
          }

          const subThreadId = resolveEventSubThreadId(
            nextBase.threads,
            payload.threadId,
            payload.subThreadId,
          );
          if (!subThreadId) return nextBase;

          return {
            ...nextBase,
            threads: updateSubThread(nextBase.threads, payload.threadId, subThreadId, (sub) => {
              const checkpoints = sub.checkpoints
                .filter((entry) => entry.checkpointTurnCount <= payload.turnCount)
                .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
                .slice(-MAX_THREAD_CHECKPOINTS);
              const retainedTurnIds = new Set(checkpoints.map((cp) => cp.turnId));
              const messages = retainThreadMessagesAfterRevert(
                sub.messages,
                retainedTurnIds,
                payload.turnCount,
              ).slice(-MAX_THREAD_MESSAGES);
              const proposedPlans = retainThreadProposedPlansAfterRevert(
                sub.proposedPlans,
                retainedTurnIds,
              ).slice(-200);
              const activities = retainThreadActivitiesAfterRevert(sub.activities, retainedTurnIds);

              const latestCheckpoint = checkpoints.at(-1) ?? null;
              const latestTurn =
                latestCheckpoint === null
                  ? null
                  : {
                      turnId: latestCheckpoint.turnId,
                      state: checkpointStatusToLatestTurnState(latestCheckpoint.status),
                      requestedAt: latestCheckpoint.completedAt,
                      startedAt: latestCheckpoint.completedAt,
                      completedAt: latestCheckpoint.completedAt,
                      assistantMessageId: latestCheckpoint.assistantMessageId,
                    };

              return {
                ...sub,
                checkpoints,
                messages: messages as OrchestrationSubThread["messages"],
                proposedPlans: proposedPlans as OrchestrationSubThread["proposedPlans"],
                activities: activities as OrchestrationSubThread["activities"],
                latestTurn,
                updatedAt: event.occurredAt,
              };
            }),
          };
        }),
      );

    case "thread.activity-appended":
      return decodeForEvent(
        ThreadActivityAppendedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => {
          const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
          if (!thread) {
            return nextBase;
          }

          const subThreadId = resolveEventSubThreadId(
            nextBase.threads,
            payload.threadId,
            payload.subThreadId,
          );
          if (!subThreadId) return nextBase;

          return {
            ...nextBase,
            threads: updateSubThread(nextBase.threads, payload.threadId, subThreadId, (sub) => {
              const activities = [
                ...sub.activities.filter((entry) => entry.id !== payload.activity.id),
                payload.activity,
              ]
                .toSorted(compareThreadActivities)
                .slice(-500);
              return { ...sub, activities, updatedAt: event.occurredAt };
            }),
          };
        }),
      );

    default:
      return Effect.succeed(nextBase);
  }
}
