/**
 * Migration 011: Remove language column (not needed - using translation_group only)
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
    console.log('Starting migration 011: Removing language column...');
    
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
    
    // Check if column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
      AND column_name = 'language'
    `, [tableName]);
    
    if (columnCheck.rows.length === 0) {
      console.log('⏭️  Skipping: language column does not exist');
      await client.query("COMMIT");
      return;
    }
    
    // Drop the language column
    await client.query(`
      ALTER TABLE ${tableName} 
      DROP COLUMN language
    `);
    console.log('  - Removed language column');
    
    await client.query("COMMIT");
    
    console.log('✅ Migration 011 completed: Language column removed!');
    console.log('   Using translation_group for linking quotes only');
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
