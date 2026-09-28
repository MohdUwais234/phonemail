import pg from "pg";
import { config } from "../config.js";
export interface Result<T = any> {
  rows: T[];
  rowCount: number | null;
}
export interface Queryable {
  query(sql: string, params?: any[]): Promise<Result>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T>;
}
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
export const db: Database = {
  query: (sql, params) => pool.query(sql, params),
  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
