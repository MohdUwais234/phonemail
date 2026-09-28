import { db, pool } from "./index.js";
import { migrate } from "./migrations.js";
await migrate(db);
await pool.end();
