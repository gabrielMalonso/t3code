import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // New table for sub-threads
  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_sub_threads (
      sub_thread_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      runtime_mode TEXT NOT NULL DEFAULT 'full-access',
      interaction_mode TEXT NOT NULL DEFAULT 'default',
      latest_turn_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_sub_threads_thread_id
    ON projection_sub_threads(thread_id)
  `;

  // Add active_sub_thread_id to projection_threads
  yield* sql`ALTER TABLE projection_threads ADD COLUMN active_sub_thread_id TEXT`;

  // Add sub_thread_id to existing tables
  yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN sub_thread_id TEXT`;
  yield* sql`ALTER TABLE projection_thread_activities ADD COLUMN sub_thread_id TEXT`;
  yield* sql`ALTER TABLE projection_thread_sessions ADD COLUMN sub_thread_id TEXT`;
  yield* sql`ALTER TABLE projection_turns ADD COLUMN sub_thread_id TEXT`;
  yield* sql`ALTER TABLE projection_pending_approvals ADD COLUMN sub_thread_id TEXT`;
  yield* sql`ALTER TABLE projection_thread_proposed_plans ADD COLUMN sub_thread_id TEXT`;

  // Data migration: create default sub-thread for each existing thread
  yield* sql`
    INSERT INTO projection_sub_threads (sub_thread_id, thread_id, title, model, runtime_mode, interaction_mode, created_at, updated_at)
    SELECT
      'default-' || thread_id,
      thread_id,
      'Main',
      model,
      COALESCE(runtime_mode, 'full-access'),
      COALESCE(interaction_mode, 'default'),
      created_at,
      updated_at
    FROM projection_threads
    WHERE deleted_at IS NULL
  `;

  // Set active_sub_thread_id on existing threads
  yield* sql`
    UPDATE projection_threads
    SET active_sub_thread_id = 'default-' || thread_id
    WHERE deleted_at IS NULL
  `;

  // Backfill sub_thread_id on existing data
  yield* sql`UPDATE projection_thread_messages SET sub_thread_id = 'default-' || thread_id`;
  yield* sql`UPDATE projection_thread_activities SET sub_thread_id = 'default-' || thread_id`;
  yield* sql`UPDATE projection_thread_sessions SET sub_thread_id = 'default-' || thread_id`;
  yield* sql`UPDATE projection_turns SET sub_thread_id = 'default-' || thread_id`;
  yield* sql`UPDATE projection_pending_approvals SET sub_thread_id = 'default-' || thread_id`;
  yield* sql`UPDATE projection_thread_proposed_plans SET sub_thread_id = 'default-' || thread_id`;
});
