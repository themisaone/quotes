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
    console.log("Starting migration 021: Remove rigid tags type constraint...");

    await client.query("BEGIN");

    const constraintCheck = await client.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conname = 'tags_type_check'
        AND conrelid = 'tags'::regclass
    `);

    if (constraintCheck.rows.length > 0) {
      console.log("  - Dropping tags_type_check constraint...");
      await client.query(`
        ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_type_check;
      `);
      console.log("✅ Migration 021 completed: Tags type constraint removed!");
      console.log("   You can now freely add/remove note types in settings.json");
      console.log("   without needing database migrations.");
    } else {
      console.log("⏭️  Skipping: tags_type_check constraint already removed");
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration 021 failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => { pool.end(); process.exit(0); })
    .catch(() => { pool.end(); process.exit(1); });
}

module.exports = { migrate };
