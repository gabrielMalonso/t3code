import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("027_ProjectionThreadsBootstrapPhase", (it) => {
  it.effect("adds bootstrap_phase to legacy projection_threads rows with a ready default", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 26 });

      yield* sql`
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
          latest_user_message_at,
          pending_approval_count,
          pending_user_input_count,
          has_actionable_proposed_plan,
          deleted_at
        )
        VALUES (
          'thread-legacy',
          'project-1',
          'Legacy thread',
          '{"provider":"codex","model":"gpt-5-codex"}',
          'full-access',
          'default',
          'main',
          NULL,
          NULL,
          '2026-04-19T00:00:00.000Z',
          '2026-04-19T00:00:00.000Z',
          NULL,
          NULL,
          0,
          0,
          0,
          NULL
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 27 });

      const rows = yield* sql<{
        readonly bootstrapPhase: string;
      }>`
        SELECT bootstrap_phase AS "bootstrapPhase"
        FROM projection_threads
        WHERE thread_id = 'thread-legacy'
      `;

      assert.deepStrictEqual(rows, [
        {
          bootstrapPhase: "ready",
        },
      ]);
    }),
  );
});
