/**
 * Migration 016: Verify attachment_type field exists
 * 
 * This migration just verifies that attachment_type exists (added in migration 009)
 * No new columns needed - we use existing image_full for file data.
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
    console.log('Starting migration 016: Verifying attachment fields...');
    
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
    
    await client.query("BEGIN");
    
    // Check if attachment_type column exists (should be from migration 009)
    const typeColumnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
        AND column_name = 'attachment_type'
    `, [tableName]);
    
    if (typeColumnCheck.rows.length === 0) {
      // Add it if somehow missing
      await client.query(`
        ALTER TABLE ${tableName} 
        ADD COLUMN attachment_type VARCHAR(50)
      `);
      console.log('  - Added attachment_type column');
    } else {
      console.log('  ✅ attachment_type column exists');
    }
    
    await client.query("COMMIT");
    
    console.log('✅ Migration 016 completed: Attachment support verified!');
    console.log('   Using: attachment_type + image_full for all file types');
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log("Migration completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

module.exports = { migrate };
