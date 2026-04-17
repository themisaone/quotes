/**
 * Add note_title column to notes table.
 * Safe to re-run — uses ADD COLUMN IF NOT EXISTS.
 */

const pool = require("../src/db");

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE notes
        ADD COLUMN IF NOT EXISTS note_title TEXT DEFAULT NULL
    `);

    await client.query("COMMIT");
    console.log("✅ note_title column added to notes table");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { migrate };
