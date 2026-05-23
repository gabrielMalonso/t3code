import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("033_ProjectionThreadLoopCompactContextUsageThreshold", (it) => {
  it.effect("adds the loop threshold default and context activity lookup index", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 34 });
      yield* sql`
        INSERT INTO projection_thread_loops (
          thread_id,
          enabled,
          prompt,
          interval_minutes,
          compact_timing,
          compact_every_runs,
          runs_since_compaction,
          next_run_at,
          last_run_at,
          last_error,
          created_at,
          updated_at
        )
        VALUES
          (
            'thread-1',
            1,
            'Check status',
            30,
            'before',
            2,
            1,
            '2026-01-01T00:30:00.000Z',
            NULL,
            NULL,
            '2026-01-01T00:00:00.000Z',
            '2026-01-01T00:00:00.000Z'
          ),
          (
            'thread-legacy-after',
            1,
            'Check legacy timing',
            30,
            'after',
            2,
            1,
            '2026-01-01T00:30:00.000Z',
            NULL,
            NULL,
            '2026-01-01T00:00:00.000Z',
            '2026-01-01T00:00:00.000Z'
          )
      `;

      yield* runMigrations({ toMigrationInclusive: 35 });

      const rows = yield* sql<{
        readonly threadId: string;
        readonly compactTiming: string;
        readonly threshold: number;
      }>`
        SELECT
          thread_id AS "threadId",
          compact_timing AS "compactTiming",
          compact_context_usage_threshold_percent AS threshold
        FROM projection_thread_loops
        WHERE thread_id IN ('thread-1', 'thread-legacy-after')
        ORDER BY thread_id
      `;
      assert.deepStrictEqual(rows, [
        { threadId: "thread-1", compactTiming: "before", threshold: 50 },
        { threadId: "thread-legacy-after", compactTiming: "before", threshold: 50 },
      ]);

      const activityIndexes = yield* sql<{
        readonly seq: number;
        readonly name: string;
        readonly unique: number;
        readonly origin: string;
        readonly partial: number;
      }>`
        PRAGMA index_list(projection_thread_activities)
      `;
      assert.ok(
        activityIndexes.some(
          (index) =>
            index.name === "idx_projection_thread_activities_thread_kind_sequence_created_id",
        ),
      );

      const activityIndexColumns = yield* sql<{
        readonly seqno: number;
        readonly cid: number;
        readonly name: string;
      }>`
        PRAGMA index_info('idx_projection_thread_activities_thread_kind_sequence_created_id')
      `;
      assert.deepStrictEqual(
        activityIndexColumns.map((column) => column.name),
        ["thread_id", "kind", "sequence", "created_at", "activity_id"],
      );
    }),
  );
});
