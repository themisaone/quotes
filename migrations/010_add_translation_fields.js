/**
 * Migration 010: Add translation_group and language to quotes
 * 
 * Enables linking quotes that are translations of each other
 * Each quote can optionally belong to a translation group and have a language code
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
    console.log('Starting migration 010: Adding translation fields to quotes...');
    
    await client.query("BEGIN");
    
    // Check if columns already exist
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quotes' 
      AND column_name IN ('translation_group', 'language')
    `);
    
    const existingColumns = columnCheck.rows.map(row => row.column_name);
    
    if (existingColumns.includes('translation_group') && existingColumns.includes('language')) {
      console.log('⏭️  Skipping: translation fields already exist');
      await client.query("COMMIT");
      return;
    }
    
    // Add translation_group column (optional, for grouping translations)
    if (!existingColumns.includes('translation_group')) {
      await client.query(`
        ALTER TABLE quotes 
        ADD COLUMN translation_group VARCHAR(100)
      `);
      console.log('  - Added translation_group column');
    }
    
    // Add language column (optional, ISO 639-1 language codes: en, no, sr, etc.)
    if (!existingColumns.includes('language')) {
      await client.query(`
        ALTER TABLE quotes 
        ADD COLUMN language VARCHAR(10)
      `);
      console.log('  - Added language column');
    }
    
    // Create index for faster translation group queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_translation_group 
      ON quotes(translation_group) 
      WHERE translation_group IS NOT NULL
    `);
    console.log('  - Created index on translation_group');
    
    await client.query("COMMIT");
    
    console.log('✅ Migration 010 completed: Translation fields added!');
    console.log('   Quotes can now be linked as translations');
    console.log('   Supported: Any language code (en, no, sr, de, fr, etc.)');
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
