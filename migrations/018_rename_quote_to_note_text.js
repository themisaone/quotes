/**
 * Migration 018: Rename 'quote' column to 'note_text'
 * 
 * The 'quote' column stores the main text content of all note types.
 * Renaming to 'note_text' for better semantic clarity.
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
    console.log("Starting migration 018: Rename 'quote' to 'note_text'...");
    
    // Check which table exists (quotes or notes)
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('quotes', 'notes')
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log("⏭️  Skipping: Neither quotes nor notes table exists");
      return;
    }
    
    const tableName = tableCheck.rows[0].table_name;
    
    // Check if 'note_text' column already exists
    const noteTextCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
        AND column_name = 'note_text'
    `, [tableName]);
    
    if (noteTextCheck.rows.length > 0) {
      console.log("⏭️  Skipping: 'note_text' column already exists");
      return;
    }
    
    // Check if 'quote' column exists
    const quoteCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
        AND column_name = 'quote'
    `, [tableName]);
    
    if (quoteCheck.rows.length === 0) {
      console.log("⏭️  Skipping: 'quote' column does not exist");
      return;
    }
    
    await client.query("BEGIN");
    
    // Rename the column
    console.log(`  - Renaming 'quote' to 'note_text' in ${tableName} table...`);
    await client.query(`
      ALTER TABLE ${tableName} 
      RENAME COLUMN quote TO note_text
    `);
    
    await client.query("COMMIT");
    
    console.log("✅ Migration 018 completed: 'quote' renamed to 'note_text'!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 018 failed:", error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((error) => {
      pool.end();
      process.exit(1);
    });
}

module.exports = { migrate };
