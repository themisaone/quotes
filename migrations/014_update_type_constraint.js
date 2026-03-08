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
    
    // This migration is obsolete - we now use dynamic types (migration 015)
    // Skip this entirely to avoid conflicts with custom training types
    console.log("⏭️  Skipping: Migration superseded by 015 (dynamic types system)");
    console.log("   Types are now managed via settings.json without database constraints");
    
    return;
  } catch (error) {
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
