/**
 * Migration 019: Rename 'image_full' column to 'attachment_full'
 * 
 * The 'image_full' column stores full-size attachments (not just images).
 * Renaming to 'attachment_full' for better semantic clarity.
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
    console.log("Starting migration 019: Rename 'image_full' to 'attachment_full'...");
    
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
    
    // Check if 'attachment_full' column already exists
    const attachmentFullCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
        AND column_name = 'attachment_full'
    `, [tableName]);
    
    if (attachmentFullCheck.rows.length > 0) {
      console.log("⏭️  Skipping: 'attachment_full' column already exists");
      return;
    }
    
    // Check if 'image_full' column exists
    const imageFullCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
        AND column_name = 'image_full'
    `, [tableName]);
    
    if (imageFullCheck.rows.length === 0) {
      console.log("⏭️  Skipping: 'image_full' column does not exist");
      return;
    }
    
    await client.query("BEGIN");
    
    // Rename the column
    console.log(`  - Renaming 'image_full' to 'attachment_full' in ${tableName} table...`);
    await client.query(`
      ALTER TABLE ${tableName} 
      RENAME COLUMN image_full TO attachment_full
    `);
    
    await client.query("COMMIT");
    
    console.log("✅ Migration 019 completed: 'image_full' renamed to 'attachment_full'!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 019 failed:", error.message);
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
