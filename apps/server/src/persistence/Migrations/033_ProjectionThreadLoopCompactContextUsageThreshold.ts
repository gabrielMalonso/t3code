import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_thread_loops
    ADD COLUMN compact_context_usage_threshold_percent INTEGER NOT NULL DEFAULT 50
  `;

  yield* sql`
    UPDATE projection_thread_loops
    SET compact_timing = 'before'
    WHERE compact_timing = 'after'
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_kind_sequence_created_id
    ON projection_thread_activities(thread_id, kind, sequence, created_at, activity_id)
  `;
});
