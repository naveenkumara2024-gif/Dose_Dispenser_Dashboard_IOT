import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

const pool =
  globalForDb.pool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle({ client: pool, schema });

// Exposed for code that needs a single dedicated connection for its lifetime — e.g. a
// Postgres advisory lock, which is scoped to the session that acquired it. Running the
// lock and unlock through the pool's auto-managed `query()` can put them on different
// physical connections, which orphans the lock (see src/jobs/monitor.ts).
export const pgPool = pool;
