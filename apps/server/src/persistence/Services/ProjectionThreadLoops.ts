/**
 * ProjectionThreadLoopRepository - Projection repository interface for thread loops.
 *
 * Owns persistence operations for projected per-thread loop configuration and
 * runtime scheduling state.
 *
 * @module ProjectionThreadLoopRepository
 */
import { IsoDateTime, PositiveInt, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadLoop = Schema.Struct({
  threadId: ThreadId,
  enabled: Schema.Boolean,
  prompt: Schema.String,
  intervalMinutes: PositiveInt,
  compactTiming: Schema.Literals(["disabled", "before", "after"]),
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

export class ProjectionThreadLoopRepository extends Context.Service<
  ProjectionThreadLoopRepository,
  ProjectionThreadLoopRepositoryShape
>()("t3/persistence/Services/ProjectionThreadLoops/ProjectionThreadLoopRepository") {}
