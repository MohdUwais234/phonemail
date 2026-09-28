import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { randomUUID } from "node:crypto";
import type { Database } from "../src/db/index.js";
import { migrate } from "../src/db/migrations.js";
export async function testDatabase() {
  let db: Database;
  let close: () => Promise<void>;
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    if (new URL(url).pathname !== "/phonemail_test")
      throw new Error("Tests require a database named phonemail_test");
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const pool = new pg.Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
    });
    db = {
      query: (s, p) => pool.query(s, p),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const r = await fn(c);
          await c.query("COMMIT");
          return r;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
    };
    close = async () => {
      await pool.end();
      // Only our randomized, isolated test schema is removed, never public/development data.
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    };
  } else {
    const pg = new PGlite();
    const wrap = (p: any): any => ({
      query: async (s: string, args: any[]) => {
        const r = await p.query(s, args);
        return { rows: r.rows, rowCount: r.affectedRows ?? null };
      },
    });
    db = {
      ...wrap(pg),
      transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    };
    close = () => pg.close();
    // PGlite uses PostgreSQL's engine; migration scripts contain several statements.
    const original = db.query.bind(db);
    db.query = async (s, p) =>
      !p && s.includes(";")
        ? ((await pg.exec(s)).at(-1) as any)
        : original(s, p);
    const originalTx = db.transaction.bind(db);
    db.transaction = (fn) =>
      originalTx(async (tx) => {
        const q = tx.query.bind(tx);
        tx.query = async (s, p) => {
          if (!p && s.includes(";")) {
            for (const part of s.split(";").filter((x) => x.trim()))
              await q(part);
            return { rows: [], rowCount: 0 };
          }
          return q(s, p);
        };
        return fn(tx);
      });
  }
  await migrate(db);
  return { db, close };
}
