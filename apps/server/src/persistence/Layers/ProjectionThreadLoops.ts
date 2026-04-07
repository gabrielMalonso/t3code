import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Option, Schema, Struct } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionThreadLoopInput,
  GetProjectionThreadLoopInput,
  ListDueProjectionThreadLoopsInput,
  ProjectionThreadLoop,
  ProjectionThreadLoopRepository,
  type ProjectionThreadLoopRepositoryShape,
} from "../Services/ProjectionThreadLoops.ts";

const ProjectionThreadLoopDbRowSchema = ProjectionThreadLoop.mapFields(
  Struct.assign({
    enabled: Schema.Number,
  }),
);

function toProjectionThreadLoop(
  row: Schema.Schema.Type<typeof ProjectionThreadLoopDbRowSchema>,
): ProjectionThreadLoop {
  return {
    threadId: row.threadId,
    enabled: row.enabled === 1,
    prompt: row.prompt,
    intervalMinutes: row.intervalMinutes,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const makeProjectionThreadLoopRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertProjectionThreadLoopRow = SqlSchema.void({
    Request: ProjectionThreadLoop,
    execute: (row) =>
      sql`
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
          ${row.threadId},
          ${row.enabled ? 1 : 0},
          ${row.prompt},
          ${row.intervalMinutes},
          ${row.nextRunAt},
          ${row.lastRunAt},
          ${row.lastError},
          ${row.createdAt},
          ${row.updatedAt}
        )
        ON CONFLICT (thread_id)
        DO UPDATE SET
          enabled = excluded.enabled,
          prompt = excluded.prompt,
          interval_minutes = excluded.interval_minutes,
          next_run_at = excluded.next_run_at,
          last_run_at = excluded.last_run_at,
          last_error = excluded.last_error,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
  });

  const getProjectionThreadLoopRow = SqlSchema.findOneOption({
    Request: GetProjectionThreadLoopInput,
    Result: ProjectionThreadLoopDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          enabled,
          prompt,
          interval_minutes AS "intervalMinutes",
          next_run_at AS "nextRunAt",
          last_run_at AS "lastRunAt",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_loops
        WHERE thread_id = ${threadId}
      `,
  });

  const listProjectionThreadLoopRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadLoopDbRowSchema,
    execute: () =>
      sql`
        SELECT
          thread_id AS "threadId",
          enabled,
          prompt,
          interval_minutes AS "intervalMinutes",
          next_run_at AS "nextRunAt",
          last_run_at AS "lastRunAt",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_loops
        ORDER BY created_at ASC, thread_id ASC
      `,
  });

  const listDueProjectionThreadLoopRows = SqlSchema.findAll({
    Request: ListDueProjectionThreadLoopsInput,
    Result: ProjectionThreadLoopDbRowSchema,
    execute: ({ dueBefore }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          enabled,
          prompt,
          interval_minutes AS "intervalMinutes",
          next_run_at AS "nextRunAt",
          last_run_at AS "lastRunAt",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_loops
        WHERE enabled = 1
          AND next_run_at IS NOT NULL
          AND next_run_at <= ${dueBefore}
        ORDER BY next_run_at ASC, thread_id ASC
      `,
  });

  const deleteProjectionThreadLoopRow = SqlSchema.void({
    Request: DeleteProjectionThreadLoopInput,
    execute: ({ threadId }) =>
      sql`
        DELETE FROM projection_thread_loops
        WHERE thread_id = ${threadId}
      `,
  });

  const upsert: ProjectionThreadLoopRepositoryShape["upsert"] = (row) =>
    upsertProjectionThreadLoopRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionThreadLoopRepository.upsert:query")),
    );

  const getByThreadId: ProjectionThreadLoopRepositoryShape["getByThreadId"] = (input) =>
    getProjectionThreadLoopRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionThreadLoopRepository.getByThreadId:query")),
      Effect.map(Option.map(toProjectionThreadLoop)),
    );

  const listAll: ProjectionThreadLoopRepositoryShape["listAll"] = () =>
    listProjectionThreadLoopRows(void 0).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionThreadLoopRepository.listAll:query")),
      Effect.map((rows) => rows.map(toProjectionThreadLoop)),
    );

  const listDue: ProjectionThreadLoopRepositoryShape["listDue"] = (input) =>
    listDueProjectionThreadLoopRows(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionThreadLoopRepository.listDue:query")),
      Effect.map((rows) => rows.map(toProjectionThreadLoop)),
    );

  const claimDueRun: ProjectionThreadLoopRepositoryShape["claimDueRun"] = (input) =>
    Effect.gen(function* () {
      yield* sql`
        UPDATE projection_thread_loops
        SET
          next_run_at = ${input.nextRunAt},
          updated_at = ${input.updatedAt}
        WHERE thread_id = ${input.threadId}
          AND enabled = 1
          AND next_run_at = ${input.expectedNextRunAt}
      `.pipe(
        Effect.mapError(toPersistenceSqlError("ProjectionThreadLoopRepository.claimDueRun:update")),
      );

      const rows = yield* sql<{
        readonly changed: number;
      }>`
        SELECT changes() AS "changed"
      `.pipe(
        Effect.mapError(
          toPersistenceSqlError("ProjectionThreadLoopRepository.claimDueRun:changes"),
        ),
      );

      return (rows[0]?.changed ?? 0) > 0;
    });

  const deleteByThreadId: ProjectionThreadLoopRepositoryShape["deleteByThreadId"] = (input) =>
    deleteProjectionThreadLoopRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionThreadLoopRepository.deleteByThreadId:query"),
      ),
    );

  return {
    upsert,
    getByThreadId,
    listAll,
    listDue,
    claimDueRun,
    deleteByThreadId,
  } satisfies ProjectionThreadLoopRepositoryShape;
});

export const ProjectionThreadLoopRepositoryLive = Layer.effect(
  ProjectionThreadLoopRepository,
  makeProjectionThreadLoopRepository,
);
