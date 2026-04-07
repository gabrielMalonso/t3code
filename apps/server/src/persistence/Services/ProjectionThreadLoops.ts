/**
 * ProjectionThreadLoopRepository - Projection repository interface for thread loops.
 *
 * Owns persistence operations for projected per-thread loop configuration and
 * runtime scheduling state.
 *
 * @module ProjectionThreadLoopRepository
 */
import { IsoDateTime, PositiveInt, ThreadId } from "@t3tools/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadLoop = Schema.Struct({
  threadId: ThreadId,
  enabled: Schema.Boolean,
  prompt: Schema.String,
  intervalMinutes: PositiveInt,
  nextRunAt: Schema.NullOr(IsoDateTime),
  lastRunAt: Schema.NullOr(IsoDateTime),
  lastError: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ProjectionThreadLoop = typeof ProjectionThreadLoop.Type;

export const GetProjectionThreadLoopInput = Schema.Struct({
  threadId: ThreadId,
});
export type GetProjectionThreadLoopInput = typeof GetProjectionThreadLoopInput.Type;

export const DeleteProjectionThreadLoopInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteProjectionThreadLoopInput = typeof DeleteProjectionThreadLoopInput.Type;

export const ListDueProjectionThreadLoopsInput = Schema.Struct({
  dueBefore: IsoDateTime,
});
export type ListDueProjectionThreadLoopsInput = typeof ListDueProjectionThreadLoopsInput.Type;

export const ClaimProjectionThreadLoopRunInput = Schema.Struct({
  threadId: ThreadId,
  expectedNextRunAt: IsoDateTime,
  nextRunAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ClaimProjectionThreadLoopRunInput = typeof ClaimProjectionThreadLoopRunInput.Type;

export interface ProjectionThreadLoopRepositoryShape {
  readonly upsert: (loop: ProjectionThreadLoop) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getByThreadId: (
    input: GetProjectionThreadLoopInput,
  ) => Effect.Effect<Option.Option<ProjectionThreadLoop>, ProjectionRepositoryError>;
  readonly listAll: () => Effect.Effect<
    ReadonlyArray<ProjectionThreadLoop>,
    ProjectionRepositoryError
  >;
  readonly listDue: (
    input: ListDueProjectionThreadLoopsInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionThreadLoop>, ProjectionRepositoryError>;
  readonly claimDueRun: (
    input: ClaimProjectionThreadLoopRunInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;
  readonly deleteByThreadId: (
    input: DeleteProjectionThreadLoopInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionThreadLoopRepository extends ServiceMap.Service<
  ProjectionThreadLoopRepository,
  ProjectionThreadLoopRepositoryShape
>()("t3/persistence/Services/ProjectionThreadLoops/ProjectionThreadLoopRepository") {}
