/**
 * Initial Schema Migration
 * Creates all tables from scratch with the current schema
 * Run this for fresh deployments (e.g., Railway, new environments)
 */

const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "quotes_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log("Starting initial schema migration...");

    await client.query("BEGIN");

    // Check if tables already exist (either old or new names)
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('quotes', 'notes')
    `);
    
    if (tableCheck.rows.length > 0) {
      const existingTable = tableCheck.rows[0].table_name;
      console.log(`⏭️  Skipping: Schema already exists (found '${existingTable}' table)`);
      await client.query("COMMIT");
      return;
    }

    // Create authors table
    console.log("Creating authors table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS authors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        image TEXT
      )
    `);

    // Create sources table (renamed from books)
    console.log("Creating sources table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'BOOK',
        image TEXT,
        CONSTRAINT sources_type_check CHECK (type IN ('BOOK', 'MOVIE'))
      )
    `);

    // Create notes table (new name, was 'quotes')
    console.log("Creating notes table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        quote TEXT NOT NULL,
        author_id INTEGER REFERENCES authors(id),
        source_id INTEGER REFERENCES sources(id),
        type VARCHAR(20) NOT NULL DEFAULT 'BOOK',
        tags TEXT,
        image TEXT,
        image_full TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT quotes_type_check CHECK (type IN ('BOOK', 'MOVIE', 'ASSORTED'))
      )
    `);

    // Create tags table
    console.log("Creating tags table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create note_tags junction table (new name, was 'quote_tags')
    console.log("Creating note_tags junction table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS note_tags (
        note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (note_id, tag_id)
      )
    `);

    // Create indexes for better query performance
    console.log("Creating indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_author_id ON notes(author_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_source_id ON notes(source_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id)
    `);

    await client.query("COMMIT");

    console.log("✅ Initial schema migration completed successfully!");
    console.log("");
    console.log("Created tables:");
    console.log("  - authors (id, name, image)");
    console.log("  - sources (id, name, type, image)");
    console.log(
      "  - quotes (id, quote, author_id, source_id, type, tags, image, image_full, note, created_at, updated_at)",
    );
    console.log("  - tags (id, name, created_at)");
    console.log("  - quote_tags (quote_id, tag_id, created_at)");
    console.log("");
    console.log("Created indexes for optimal performance");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", error.message);
    console.error(error);
    throw error; // Don't process.exit here - let runner handle it
  } finally {
    client.release();
    // Don't end pool here - let the migration runner handle it
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate().then(() => {
    pool.end();
    process.exit(0);
  }).catch((error) => {
    pool.end();
    process.exit(1);
  });
}

module.exports = { migrate };
