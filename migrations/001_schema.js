/**
 * Clean baseline schema for misas_notes_db.
 * Replaces all prior incremental migrations (archived in migrations/archive/).
 * Every statement uses IF NOT EXISTS / IF EXISTS so it is safe to re-run.
 */

async function migrate({ client: providedClient, logger = console } = {}) {
  const pool = providedClient ? null : require("../src/db");
  const client = providedClient || await pool.connect();
  const ownsClient = !providedClient;

  try {
    if (ownsClient) await client.query("BEGIN");

    // ── authors ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS authors (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL UNIQUE,
        image       TEXT         DEFAULT ''::text,
        description TEXT         DEFAULT ''::text,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name)`);

    // ── sources ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL UNIQUE,
        image      TEXT         DEFAULT ''::character varying,
        type       VARCHAR(20)  DEFAULT 'BOOK',
        created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_books_name ON sources(name)`);
    // Remove the old hard-coded type CHECK constraint — user may add custom subtypes
    await client.query(`ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check`);

    // ── notes ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id                  SERIAL PRIMARY KEY,
        note_text           TEXT         NOT NULL,
        note_format         VARCHAR(20)  NOT NULL DEFAULT 'html',
        author_id           INTEGER      REFERENCES authors(id) ON DELETE SET NULL,
        source_id           INTEGER      REFERENCES sources(id) ON DELETE SET NULL,
        type                VARCHAR(20)  DEFAULT 'BOOK',
        score               TEXT,
        thumbnail           TEXT         DEFAULT ''::text,
        attachment_full     TEXT         DEFAULT ''::text,
        attachment_type     VARCHAR(20)  DEFAULT 'image',
        attachment_filename VARCHAR(500),
        comment             TEXT         DEFAULT ''::text,
        translation_group   VARCHAR(100),
        note_type           VARCHAR(20)  DEFAULT 'quote',
        note_date           DATE,
        created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quotes_author_id       ON notes(author_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quotes_source_id       ON notes(source_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quotes_book_id         ON notes(source_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quotes_created_at      ON notes(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quotes_note_type       ON notes(note_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quotes_note_date       ON notes(note_date) WHERE note_date IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notes_translation_group ON notes(translation_group) WHERE translation_group IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quotes_translation_group ON notes(translation_group) WHERE translation_group IS NOT NULL`);

    // ── tags ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        type       VARCHAR(20)  NOT NULL DEFAULT 'quote',
        created_at TIMESTAMP    DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX  IF NOT EXISTS idx_tags_name ON tags(name)`);
    await client.query(`CREATE INDEX  IF NOT EXISTS idx_tags_type ON tags(type)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS tags_name_type_unique ON tags(name, type)`);
    // Remove any old type CHECK constraint — types are fully user-defined
    await client.query(`ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_type_check`);

    // ── note_tags ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS note_tags (
        note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id     INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT now(),
        PRIMARY KEY (note_id, tag_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quote_tags_quote_id ON note_tags(note_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quote_tags_tag_id   ON note_tags(tag_id)`);

    // ── note_attachments ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS note_attachments (
        id               SERIAL PRIMARY KEY,
        note_id          INTEGER      NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        position         INTEGER      NOT NULL DEFAULT 0,
        thumbnail        TEXT,
        attachment_full  TEXT,
        attachment_type  VARCHAR(30),
        storage_type     VARCHAR(20),
        filename         VARCHAR(500),
        created_at       TIMESTAMPTZ  DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_note_attachments_note_id ON note_attachments(note_id, position)`);

    if (ownsClient) await client.query("COMMIT");
    logger.log("✅ Schema up to date");
  } catch (err) {
    if (ownsClient) await client.query("ROLLBACK");
    throw err;
  } finally {
    if (ownsClient) client.release();
  }
}

module.exports = { migrate };
