import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_loops (
      thread_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL,
      next_run_at TEXT,
      last_run_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_loops_due
    ON projection_thread_loops(enabled, next_run_at)
  `;
});
