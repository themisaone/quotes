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
    console.log("Starting migration 006: Drop old tags column...");
    await client.query("BEGIN");

    // Drop the old tags column from quotes table
    console.log("Dropping old 'tags' column from quotes table...");
    await client.query(`
      ALTER TABLE quotes DROP COLUMN IF EXISTS tags;
    `);

    console.log("Migration 006 completed successfully!");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration 006 failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
