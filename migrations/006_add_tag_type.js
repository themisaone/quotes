/**
 * ============================================================
 * MIGRATION 006: Add 'type' column to tags table
 * ============================================================
 * 
 * PURPOSE:
 * Add a 'type' column to the tags table to support note-type-specific tags.
 * Each tag will be associated with a specific note type (note, joke, puzzle, training).
 * 
 * CHANGES:
 * 1. Add 'type' column to tags table with default 'quote'
 * 2. Add CHECK constraint to ensure valid types
 * 3. Create index on type column for performance
 * 4. Update UNIQUE constraint to be (name, type) instead of just (name)
 * 
 * ROLLBACK:
 * If needed, run: ALTER TABLE tags DROP COLUMN type;
 * ============================================================
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
    console.log("Starting migration 006: add type column to tags...");

    // Check if type column already exists
    const checkColumn = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'tags' AND column_name = 'type'
      )
    `);

    if (checkColumn.rows[0].exists) {
      console.log("⏭️  Skipping: type column already exists in tags table");
      return;
    }

    await client.query("BEGIN");

    // Step 1: Add type column with default value 'quote' (for existing tags)
    console.log("Step 1: Adding type column to tags table...");
    await client.query(`
      ALTER TABLE tags 
      ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'quote'
    `);
    console.log("✅ Type column added");

    // Step 2: Add CHECK constraint for valid types
    console.log("Step 2: Adding CHECK constraint for tag types...");
    await client.query(`
      ALTER TABLE tags 
      ADD CONSTRAINT tags_type_check 
      CHECK (type IN ('quote', 'note', 'puzzle', 'training'))
    `);
    console.log("✅ CHECK constraint added");

    // Step 3: Drop old unique constraint on name only
    console.log("Step 3: Updating unique constraint...");
    await client.query(`
      ALTER TABLE tags 
      DROP CONSTRAINT IF EXISTS tags_name_key
    `);
    console.log("✅ Old unique constraint dropped");

    // Step 4: Add new unique constraint on (name, type)
    console.log("Step 4: Adding unique constraint on (name, type)...");
    await client.query(`
      ALTER TABLE tags 
      ADD CONSTRAINT tags_name_type_unique 
      UNIQUE (name, type)
    `);
    console.log("✅ New unique constraint added");

    // Step 5: Create index on type column
    console.log("Step 5: Creating index on type column...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type)
    `);
    console.log("✅ Index created");

    await client.query("COMMIT");

    console.log("\n✅ Migration 006 completed successfully!");
    console.log("\nChanges:");
    console.log("  - Added 'type' column to tags table");
    console.log("  - Added CHECK constraint for valid types");
    console.log("  - Updated unique constraint to (name, type)");
    console.log("  - Created index on type column");
    console.log("\nNote: All existing tags have been set to type 'quote'");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 006 failed:", error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log("Migration script finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = { migrate };
