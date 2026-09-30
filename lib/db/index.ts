import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One pool per server instance. On Vercel, DATABASE_URL should be Neon's
// *pooled* connection string (the "-pooler" host): serverless instances come
// and go, and the pooler is what keeps that from exhausting Postgres
// connections. Locally it's any Postgres — see README "Database".
//
// Cached on globalThis so dev-mode hot reloads reuse the pool instead of
// opening a new one on every edit.
const globalForDb = globalThis as unknown as { elocuPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see README \"Database\" for local setup.");
  }
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
  // Lets Vercel close idle clients before a function instance is suspended,
  // instead of leaking them until Postgres times them out. No-op elsewhere.
  attachDatabasePool(pool);
  return pool;
}

let dbInstance: NodePgDatabase<typeof schema> | null = null;

/** Lazily connects on first use, so importing this module (e.g. at build time) never needs DATABASE_URL. */
export function db(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    globalForDb.elocuPool ??= createPool();
    dbInstance = drizzle(globalForDb.elocuPool, { schema });
  }
  return dbInstance;
}

export { schema };
