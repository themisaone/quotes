/**
 * Migration 020: Rename 'image' column to 'thumbnail'
 * 
 * The 'image' column stores thumbnail/preview images.
 * Renaming to 'thumbnail' for better semantic clarity.
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
    console.log("Starting migration 020: Rename 'image' to 'thumbnail'...");
    
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
    
    // Check if 'thumbnail' column already exists
    const thumbnailCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
        AND column_name = 'thumbnail'
    `, [tableName]);
    
    if (thumbnailCheck.rows.length > 0) {
      console.log("⏭️  Skipping: 'thumbnail' column already exists");
      return;
    }
    
    // Check if 'image' column exists
    const imageCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
        AND column_name = 'image'
    `, [tableName]);
    
    if (imageCheck.rows.length === 0) {
      console.log("⏭️  Skipping: 'image' column does not exist");
      return;
    }
    
    await client.query("BEGIN");
    
    // Rename the column
    console.log(`  - Renaming 'image' to 'thumbnail' in ${tableName} table...`);
    await client.query(`
      ALTER TABLE ${tableName} 
      RENAME COLUMN image TO thumbnail
    `);
    
    await client.query("COMMIT");
    
    console.log("✅ Migration 020 completed: 'image' renamed to 'thumbnail'!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 020 failed:", error.message);
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
