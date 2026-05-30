import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run raw SQL migrations on startup
async function runMigrations() {
  const client = await pool.connect();
  try {
    logger.info("Running database migrations...");
    await client.query(`
      ALTER TABLE assistants ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai';
      ALTER TABLE assistants ADD COLUMN IF NOT EXISTS charlotte_conversation_id text;
    `);
    logger.info("Database migrations complete.");
  } catch (err) {
    logger.warn({ err }, "Migration failed — continuing anyway");
  } finally {
    client.release();
  }
}

runMigrations().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
});
