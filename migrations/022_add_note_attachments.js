/**
 * Migration 022: Add note_attachments table
 *
 * Introduces a proper one-to-many attachment table so each note can hold
 * multiple attachments.  Existing single-attachment data on notes.thumbnail /
 * notes.attachment_full is migrated into the new table at position = 0.
 *
 * The old columns are NOT dropped here — the server will keep populating the
 * flat fields from attachments[0] for backward compatibility.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'quotes_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function migrate() {
  const client = await pool.connect();
  try {
    // ── Idempotency check ─────────────────────────────────────────────────────
    const tableExists = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'note_attachments'
    `);
    if (tableExists.rows.length > 0) {
      console.log('⏭️  Skipping 022: note_attachments table already exists');
      return;
    }

    console.log('Creating note_attachments table and migrating existing data...');
    await client.query('BEGIN');

    // ── Create table ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE note_attachments (
        id              SERIAL PRIMARY KEY,
        note_id         INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        position        INTEGER NOT NULL DEFAULT 0,
        thumbnail       TEXT,
        attachment_full TEXT,
        attachment_type VARCHAR(30),
        storage_type    VARCHAR(20),
        filename        VARCHAR(500),
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX idx_note_attachments_note_id ON note_attachments(note_id, position)
    `);

    // ── Migrate existing single attachments ───────────────────────────────────
    const { rowCount } = await client.query(`
      INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full,
                                    attachment_type, storage_type, created_at)
      SELECT id, 0, thumbnail, attachment_full,
             COALESCE(attachment_type, 'image'), 'base64',
             COALESCE(created_at, NOW())
      FROM notes
      WHERE (thumbnail IS NOT NULL AND thumbnail != '')
         OR (attachment_full IS NOT NULL AND attachment_full != '')
    `);

    await client.query('COMMIT');
    console.log(`✅ Migration 022 complete: note_attachments created, ${rowCount} rows migrated`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 022 failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrate };
