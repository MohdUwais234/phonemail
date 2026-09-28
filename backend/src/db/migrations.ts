import { readdir, readFile } from "node:fs/promises";
import type { Database } from "./index.js";
export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(7348321)");
    await tx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const path = new URL("../../../database/migrations/", import.meta.url);
    for (const file of (await readdir(path))
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort()) {
      if (
        (
          await tx.query(
            "SELECT version FROM schema_migrations WHERE version=$1",
            [file],
          )
        ).rows.length
      )
        continue;
      await tx.query(await readFile(new URL(file, path), "utf8"));
      await tx.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        file,
      ]);
    }
  });
}
