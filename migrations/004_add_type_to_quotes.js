/**
 * Migration 004: Add Type to Quotes
 * Moves the 'type' field from sources table to quotes table
 *
 * NOTE: This migration is only needed for EXISTING databases
 * that had type in the sources table. New deployments should use
 * 001_initial_schema.js instead.
 */

const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log("Starting migration 004: add type to quotes table...");

    // Check if type column already exists in quotes
    const checkColumn = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'quotes' 
                AND column_name = 'type'
            )
        `);

    if (checkColumn.rows[0].exists) {
      console.log("⏭️  Skipping: type column already exists in quotes table");
      return;
    }

    await client.query("BEGIN");

    // Step 1: Add type column to quotes table
    console.log("Step 1: Adding type column to quotes...");
    await client.query(`
            ALTER TABLE quotes 
            ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'BOOK'
        `);

    // Step 2: Copy type from sources to quotes where source_id exists
    console.log("Step 2: Copying type from sources to quotes...");
    await client.query(`
            UPDATE quotes q
            SET type = s.type
            FROM sources s
            WHERE q.source_id = s.id
        `);

    // Step 3: Set type to BOOK for quotes without source
    console.log("Step 3: Setting BOOK type for quotes without source...");
    await client.query(`
            UPDATE quotes
            SET type = 'BOOK'
            WHERE source_id IS NULL AND type IS NULL
        `);

    // Step 4: Add check constraint
    console.log("Step 4: Adding check constraint...");
    await client.query(`
            ALTER TABLE quotes
            ADD CONSTRAINT quotes_type_check 
            CHECK (type IN ('BOOK', 'MOVIE', 'ASSORTED'))
        `);

    await client.query("COMMIT");
    console.log("✅ Migration 004 completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 004 failed:", error.message);
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
      console.error("Error:", error);
      process.exit(1);
    });
}

module.exports = { migrate };
