/**
 * Add note_format to distinguish legacy HTML notes from new Markdown notes.
 * Existing rows default to html and are not converted.
 */

async function migrate({ client: providedClient, logger = console } = {}) {
  const pool = providedClient ? null : require("../src/db");
  const client = providedClient || await pool.connect();
  const ownsClient = !providedClient;

  try {
    if (ownsClient) await client.query("BEGIN");

    await client.query(`
      ALTER TABLE notes
        ADD COLUMN IF NOT EXISTS note_format VARCHAR(20) NOT NULL DEFAULT 'html'
    `);

    if (ownsClient) await client.query("COMMIT");
    logger.log("✅ note_format column ensured on notes table");
  } catch (err) {
    if (ownsClient) await client.query("ROLLBACK");
    throw err;
  } finally {
    if (ownsClient) client.release();
  }
}

module.exports = { migrate };
