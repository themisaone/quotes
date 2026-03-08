require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log("Starting migration 007: Adding POETRY, LYRICS, and JOKES types...");
    
    // This migration is obsolete - we now use dynamic types (migration 015)
    // Skip this entirely to avoid conflicts with custom training types
    console.log("⏭️  Skipping: Migration superseded by 015 (dynamic types system)");
    console.log("   Types are now managed via settings.json without database constraints");
    
    return;
  } catch (error) {
    console.error("❌ Migration 007 failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Only call migrate() if run directly (not via migration runner)
if (require.main === module) {
  migrate().then(() => {
    pool.end();
    process.exit(0);
  }).catch((error) => {
    pool.end();
    process.exit(1);
  });
}

module.exports = { migrate };
