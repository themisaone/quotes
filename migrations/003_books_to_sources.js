/**
 * Migration 003: Books to Sources
 * Renames 'books' table to 'sources' and adds 'type' field
 *
 * NOTE: This migration is only needed for EXISTING databases
 * that used the old 'books' table. New deployments should use
 * 001_initial_schema.js instead.
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
    console.log("Starting migration 003: books -> sources...");

    // Check if 'books' table exists (if not, migration already done or not needed)
    const checkBooks = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'books'
      )
    `);

    if (!checkBooks.rows[0].exists) {
      console.log(
        "⏭️  Skipping: books table does not exist (already migrated or not needed)",
      );
      return;
    }

    await client.query("BEGIN");

    // 1. Add type column to books table with default 'BOOK'
    console.log("Step 1: Adding type column...");
    await client.query(`
      ALTER TABLE books 
      ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'BOOK'
    `);

    // 2. Set all existing books to type 'BOOK'
    console.log("Step 2: Setting existing entries to BOOK...");
    await client.query(`
      UPDATE books SET type = 'BOOK' WHERE type IS NULL
    `);

    // 3. Rename table from books to sources
    console.log("Step 3: Renaming books table to sources...");
    await client.query(`
      ALTER TABLE books RENAME TO sources
    `);

    // 4. Rename foreign key column in quotes table
    console.log("Step 4: Renaming book_id to source_id in quotes...");
    await client.query(`
      ALTER TABLE quotes RENAME COLUMN book_id TO source_id
    `);

    // 5. Add constraint to ensure valid types
    console.log("Step 5: Adding check constraint for type...");
    await client.query(`
      ALTER TABLE sources 
      ADD CONSTRAINT sources_type_check 
      CHECK (type IN ('BOOK', 'MOVIE', 'ASSORTED'))
    `);

    await client.query("COMMIT");
    console.log("✅ Migration 003 completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 003 failed:", error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Failed:", error);
      process.exit(1);
    });
}

module.exports = { migrate };
