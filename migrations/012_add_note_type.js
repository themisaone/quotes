/**
 * Migration 012: Add note_type to support different types of notes
 * 
 * Transforms quotes table into a general notes system
 * Types: quote, note, training, puzzle
 * All existing quotes become note_type='quote' automatically
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
    console.log('Starting migration 012: Adding note_type column...');
    
    await client.query("BEGIN");
    
    // Check if column already exists (on either quotes or notes table)
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE (table_name = 'quotes' OR table_name = 'notes')
      AND column_name = 'note_type'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('⏭️  Skipping: note_type column already exists');
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
    
    // Add note_type column with default 'quote'
    await client.query(`
      ALTER TABLE ${tableName} 
      ADD COLUMN note_type VARCHAR(20) DEFAULT 'quote'
    `);
    console.log('  - Added note_type column');
    
    // Set all existing records to 'quote' explicitly
    await client.query(`
      UPDATE ${tableName} 
      SET note_type = 'quote' 
      WHERE note_type IS NULL
    `);
    console.log(`  - Set existing ${tableName} to note_type=quote`);
    
    // Create index for faster filtering by note type (with IF NOT EXISTS)
    const indexName = tableName === 'notes' ? 'idx_notes_note_type' : 'idx_quotes_note_type';
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${indexName} 
      ON ${tableName}(note_type)
    `);
    console.log('  - Created index on note_type');
    
    await client.query("COMMIT");
    
    console.log('✅ Migration 012 completed: Note types system enabled!');
    console.log('   Supported types: quote, note, training, puzzle');
    console.log('   All existing quotes preserved as note_type=quote');
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
