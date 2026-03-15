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
    console.log("Starting migration 015: Remove rigid type constraint...");
    
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
    const constraintName = tableName === 'notes' ? 'notes_type_check' : 'quotes_type_check';
    
    await client.query("BEGIN");

    // Check if constraint exists
    const constraintCheck = await client.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conname = $1 
        AND conrelid = $2::regclass
    `, [constraintName, tableName]);

    if (constraintCheck.rows.length > 0) {
      console.log("  - Dropping rigid type constraint...");
      await client.query(`
        ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${constraintName};
      `);
      console.log("✅ Migration 015 completed: Type constraint removed!");
      console.log("   You can now freely add/remove training types in settings.json");
      console.log("   without needing database migrations.");
    } else {
      console.log("⏭️  Skipping: Type constraint already removed");
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration 015 failed:", error);
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
