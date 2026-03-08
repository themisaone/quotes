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
    await client.query("BEGIN");

    // Check if constraint exists
    const constraintCheck = await client.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conname = 'quotes_type_check' 
        AND conrelid = 'quotes'::regclass
    `);

    if (constraintCheck.rows.length > 0) {
      console.log("  - Dropping rigid type constraint...");
      await client.query(`
        ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_type_check;
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
