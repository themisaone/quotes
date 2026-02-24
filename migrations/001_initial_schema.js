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

    // Create quotes table with all current fields
    console.log("Creating quotes table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotes (
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

    // Create quote_tags junction table
    console.log("Creating quote_tags junction table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_tags (
        quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (quote_id, tag_id)
      )
    `);

    // Create indexes for better query performance
    console.log("Creating indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_author_id ON quotes(author_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_source_id ON quotes(source_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_tags_quote_id ON quote_tags(quote_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_tags_tag_id ON quote_tags(tag_id)
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
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
