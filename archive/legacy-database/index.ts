import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "@/db/schema";

/**
 * Global, _singleton_ Drizzle ORM instance configured for **PostgreSQL**.
 *
 * Always import `db` from this module instead of instantiating a new client
 * in every file. This keeps the connection pool small and enables Drizzle's
 * query caching.
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

// Re-export the underlying Pool for edge-cases (e.g. `COPY` operations).
export { pool };
