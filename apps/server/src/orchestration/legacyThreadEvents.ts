import type { ProjectId } from "@t3tools/contracts";
import { ThreadCreatedPayload, ThreadSubThreadCreatedPayload } from "@t3tools/contracts";

export function legacySubThreadCreatedToThreadCreated(input: {
  readonly parentProjectId: ProjectId;
  readonly payload: typeof ThreadSubThreadCreatedPayload.Type;
}): typeof ThreadCreatedPayload.Type {
  return {
    threadId: input.payload.subThreadId,
    projectId: input.parentProjectId,
    title: input.payload.title,
    model: input.payload.model,
    runtimeMode: input.payload.runtimeMode,
    interactionMode: input.payload.interactionMode,
    branch: input.payload.branch,
    worktreePath: input.payload.worktreePath,
    createdAt: input.payload.createdAt,
    updatedAt: input.payload.updatedAt,
  };
}
