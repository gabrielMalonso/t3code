import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_thread_loops
    ADD COLUMN compact_every_runs INTEGER NOT NULL DEFAULT 1
  `;

  yield* sql`
    ALTER TABLE projection_thread_loops
    ADD COLUMN runs_since_compaction INTEGER NOT NULL DEFAULT 0
  `;
});
