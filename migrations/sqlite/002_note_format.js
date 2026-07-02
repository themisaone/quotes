/**
 * Add note_format to distinguish legacy HTML notes from new Markdown notes.
 * Existing rows default to html and are not converted.
 */

async function columnExists(client, tableName, columnName) {
  const result = await client.query(`PRAGMA table_info(${tableName})`);
  return result.rows.some((row) => row.name === columnName);
}

async function migrate({ client: providedClient, logger = console } = {}) {
  const pool = providedClient ? null : require("../../src/db");
  const client = providedClient || await pool.connect();
  const ownsClient = !providedClient;

  try {
    if (ownsClient) await client.query("BEGIN");

    if (!await columnExists(client, "notes", "note_format")) {
      await client.query("ALTER TABLE notes ADD COLUMN note_format TEXT NOT NULL DEFAULT 'html'");
    }

    if (ownsClient) await client.query("COMMIT");
    logger.log("✅ SQLite note_format column ensured on notes table");
  } catch (err) {
    if (ownsClient) await client.query("ROLLBACK");
    throw err;
  } finally {
    if (ownsClient) client.release();
  }
}

module.exports = { migrate };
