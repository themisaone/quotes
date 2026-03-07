/**
 * Migration 014: Update type constraint to include training types
 * 
 * The type column is reused for different note types:
 * - For quotes: BOOK, MOVIE-TV, POETRY, LYRICS, JOKES, ASSORTED
 * - For training: WEIGHTS, CARDIO, FLEXIBILITY, SPORTS
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
    console.log('Starting migration 014: Updating type constraint...');
    
    await client.query("BEGIN");
    
    // Check if constraint already includes training types
    const constraintCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conname = 'quotes_type_check' 
      AND conrelid = 'quotes'::regclass
    `);
    
    if (constraintCheck.rows.length > 0) {
      const definition = constraintCheck.rows[0].definition;
      
      // Check if WEIGHTS is already in the constraint
      if (definition.includes('WEIGHTS')) {
        console.log('⏭️  Skipping: Type constraint already includes training types');
        await client.query("COMMIT");
        return;
      }
      
      // Drop old constraint
      await client.query(`
        ALTER TABLE quotes 
        DROP CONSTRAINT quotes_type_check
      `);
      console.log('  - Dropped old type constraint');
    }
    
    // Add new constraint that includes training types
    await client.query(`
      ALTER TABLE quotes 
      ADD CONSTRAINT quotes_type_check 
      CHECK (type IN (
        'BOOK', 'MOVIE-TV', 'POETRY', 'LYRICS', 'JOKES', 'ASSORTED',
        'WEIGHTS', 'CARDIO', 'FLEXIBILITY', 'SPORTS'
      ))
    `);
    console.log('  - Added updated type constraint with training types');
    
    await client.query("COMMIT");
    
    console.log('✅ Migration 014 completed: Type constraint updated!');
    console.log('   Now supports: Quote types + Training types');
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
