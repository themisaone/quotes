/**
 * Add note_title column to notes table.
 * Safe to re-run — uses ADD COLUMN IF NOT EXISTS.
 */

const pool = require("../src/db");

async function migrate({ client: providedClient, logger = console } = {}) {
  const client = providedClient || await pool.connect();
  const ownsClient = !providedClient;

  try {
    if (ownsClient) await client.query("BEGIN");

    await client.query(`
      ALTER TABLE notes
        ADD COLUMN IF NOT EXISTS note_title TEXT DEFAULT NULL
    `);

    if (ownsClient) await client.query("COMMIT");
    logger.log("✅ note_title column ensured on notes table");
  } catch (err) {
    if (ownsClient) await client.query("ROLLBACK");
    throw err;
  } finally {
    if (ownsClient) client.release();
  }
}

module.exports = { migrate };
