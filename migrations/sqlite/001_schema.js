/**
 * SQLite baseline schema.
 * This is separate from the Postgres baseline because SQLite has different
 * auto-increment and timestamp syntax.
 */

async function migrate({ client: providedClient, logger = console } = {}) {
  const pool = providedClient ? null : require("../../src/db");
  const client = providedClient || await pool.connect();
  const ownsClient = !providedClient;

  try {
    if (ownsClient) await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS authors (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        image       TEXT DEFAULT '',
        description TEXT DEFAULT '',
        created_at  TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL UNIQUE,
        image      TEXT DEFAULT '',
        type       TEXT DEFAULT 'BOOK',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_books_name ON sources(name)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        note_text           TEXT NOT NULL,
        note_title          TEXT DEFAULT NULL,
        author_id           INTEGER REFERENCES authors(id) ON DELETE SET NULL,
        source_id           INTEGER REFERENCES sources(id) ON DELETE SET NULL,
        type                TEXT DEFAULT 'BOOK',
        score               TEXT,
        thumbnail           TEXT DEFAULT '',
        attachment_full     TEXT DEFAULT '',
        attachment_type     TEXT DEFAULT 'image',
        attachment_filename TEXT,
        comment             TEXT DEFAULT '',
        translation_group   TEXT,
        note_type           TEXT DEFAULT 'quote',
        note_date           TEXT,
        created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_quotes_author_id ON notes(author_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_quotes_source_id ON notes(source_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_quotes_book_id ON notes(source_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON notes(created_at DESC)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_quotes_note_type ON notes(note_type)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_quotes_note_date ON notes(note_date) WHERE note_date IS NOT NULL");
    await client.query("CREATE INDEX IF NOT EXISTS idx_notes_translation_group ON notes(translation_group) WHERE translation_group IS NOT NULL");
    await client.query("CREATE INDEX IF NOT EXISTS idx_quotes_translation_group ON notes(translation_group) WHERE translation_group IS NOT NULL");

    await client.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        type       TEXT NOT NULL DEFAULT 'quote',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type)");
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS tags_name_type_unique ON tags(name, type)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS note_tags (
        note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (note_id, tag_id)
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_quote_tags_quote_id ON note_tags(note_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_quote_tags_tag_id ON note_tags(tag_id)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS note_attachments (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id          INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        position         INTEGER NOT NULL DEFAULT 0,
        thumbnail        TEXT,
        attachment_full  TEXT,
        attachment_type  TEXT,
        storage_type     TEXT,
        filename         TEXT,
        created_at       TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_note_attachments_note_id ON note_attachments(note_id, position)");

    if (ownsClient) await client.query("COMMIT");
    logger.log("✅ SQLite schema up to date");
  } catch (err) {
    if (ownsClient) await client.query("ROLLBACK");
    throw err;
  } finally {
    if (ownsClient) client.release();
  }
}

module.exports = { migrate };
