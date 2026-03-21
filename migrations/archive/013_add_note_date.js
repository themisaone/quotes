/**
 * Migration: Add note_date field
 * Adds a date field for note types that need it (e.g., Training)
 */

const { Pool } = require('pg');
require('dotenv').config();

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
    console.log('Starting migration 013: Adding note_date field...');
    
    await client.query("BEGIN");
    
    // Check if note_date column already exists (on either quotes or notes table)
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE (table_name = 'quotes' OR table_name = 'notes')
      AND column_name = 'note_date'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('⏭️  Skipping: note_date column already exists');
      await client.query("COMMIT");
      return;
    }
    
    // Determine which table name to use (quotes or notes)
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('quotes', 'notes')
      AND table_schema = 'public'
    `);
    
    const tableName = tableCheck.rows.find(r => r.table_name === 'notes') 
      ? 'notes' 
      : 'quotes';
    
    console.log(`  Using table: ${tableName}`);
    
    // Add note_date column (DATE type, nullable)
    await client.query(`
      ALTER TABLE ${tableName}
      ADD COLUMN note_date DATE
    `);
    
    console.log('  ✓ Added note_date column');
    
    // Add index for date queries (with IF NOT EXISTS)
    const indexName = tableName === 'notes' ? 'idx_notes_note_date' : 'idx_quotes_note_date';
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(note_date)
      WHERE note_date IS NOT NULL
    `);
    
    console.log('  ✓ Added index on note_date');
    
    await client.query("COMMIT");
    
    console.log('✅ Migration 013 completed: note_date field added!');
    
  } catch (error) {
    await client.query("ROLLBACK");
    console.error('Error in migration 013:', error);
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
