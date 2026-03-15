/**
 * Migration 017: Rename 'note' column to 'comment'
 * 
 * The 'note' column stores optional comments/descriptions for quotes.
 * Renaming to 'comment' for better clarity.
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
    console.log("Starting migration 017: Rename 'note' to 'comment'...");
    
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
    
    // Check if 'comment' column already exists
    const commentCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
        AND column_name = 'comment'
    `, [tableName]);
    
    if (commentCheck.rows.length > 0) {
      console.log("⏭️  Skipping: 'comment' column already exists");
      return;
    }
    
    // Check if 'note' column exists
    const noteCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
        AND column_name = 'note'
    `, [tableName]);
    
    if (noteCheck.rows.length === 0) {
      console.log("⏭️  Skipping: 'note' column does not exist");
      return;
    }
    
    await client.query("BEGIN");
    
    // Rename the column
    console.log(`  - Renaming 'note' to 'comment' in ${tableName} table...`);
    await client.query(`
      ALTER TABLE ${tableName} 
      RENAME COLUMN note TO comment
    `);
    
    await client.query("COMMIT");
    
    console.log("✅ Migration 017 completed: 'note' renamed to 'comment'!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 017 failed:", error.message);
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
