import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";

// Run migrations inline — safe to call multiple times (IF NOT EXISTS)
(async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE assistants ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai';
      ALTER TABLE assistants ADD COLUMN IF NOT EXISTS charlotte_conversation_id text;
    `);
    console.log("[db] migrations ok");
  } catch (e) {
    console.warn("[db] migration warning:", e);
  } finally {
    client.release();
  }
})();
