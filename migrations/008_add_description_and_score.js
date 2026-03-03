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
    console.log("Starting migration 008: Adding description to authors and score to quotes...");
    await client.query("BEGIN");

    // Add description field to authors table
    console.log("  - Adding description field to authors table...");
    await client.query(`
      ALTER TABLE authors 
      ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''
    `);
    
    // Add score field to quotes table as TEXT
    console.log("  - Adding score field to quotes table...");
    await client.query(`
      ALTER TABLE quotes 
      ADD COLUMN IF NOT EXISTS score TEXT DEFAULT NULL
    `);

    console.log("✅ Migration 008 completed: Added description (authors) and score (quotes) fields!");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 008 failed:", error);
    throw error;
  } finally {
    client.release();
    // Don't end pool here - let the migration runner handle it
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
