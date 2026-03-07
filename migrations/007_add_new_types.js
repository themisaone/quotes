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
    await client.query("BEGIN");

    // Check if there are any training types in the database
    const trainingCheck = await client.query(`
      SELECT COUNT(*) as count 
      FROM quotes 
      WHERE type IN ('WEIGHTS', 'CARDIO', 'FLEXIBILITY', 'SPORTS')
    `);
    
    const hasTrainingTypes = trainingCheck.rows[0].count > 0;
    
    // Drop old constraints
    console.log("  - Dropping old type constraints...");
    await client.query(`
      ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;
    `);
    await client.query(`
      ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_type_check;
    `);

    // Add new constraints - include training types if they exist in data
    if (hasTrainingTypes) {
      console.log("  - Adding new constraints with 6 quote types + 4 training types...");
      await client.query(`
        ALTER TABLE sources ADD CONSTRAINT sources_type_check 
          CHECK (type IN ('BOOK', 'MOVIE-TV', 'ASSORTED', 'POETRY', 'LYRICS', 'JOKES'));
      `);
      await client.query(`
        ALTER TABLE quotes ADD CONSTRAINT quotes_type_check 
          CHECK (type IN ('BOOK', 'MOVIE-TV', 'ASSORTED', 'POETRY', 'LYRICS', 'JOKES', 'WEIGHTS', 'CARDIO', 'FLEXIBILITY', 'SPORTS'));
      `);
      console.log("✅ Migration 007 completed: Quote types + Training types added!");
    } else {
      console.log("  - Adding new constraints with 6 types...");
      await client.query(`
        ALTER TABLE sources ADD CONSTRAINT sources_type_check 
          CHECK (type IN ('BOOK', 'MOVIE-TV', 'ASSORTED', 'POETRY', 'LYRICS', 'JOKES'));
      `);
      await client.query(`
        ALTER TABLE quotes ADD CONSTRAINT quotes_type_check 
          CHECK (type IN ('BOOK', 'MOVIE-TV', 'ASSORTED', 'POETRY', 'LYRICS', 'JOKES'));
      `);
      console.log("✅ Migration 007 completed: New types (POETRY 📜, LYRICS 🎵, JOKES 😂) added!");
    }
    
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 007 failed:", error);
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
