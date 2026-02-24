/**
 * Migration 005: Normalize Tags System
 * Creates tags and quote_tags tables and migrates existing comma-separated tags
 *
 * This migration:
 * 1. Creates tags table for unique tag names
 * 2. Creates quote_tags junction table for many-to-many relationships
 * 3. Migrates existing tags from quotes.tags column
 * 4. Creates indexes for performance
 * 5. Preserves old tags column for safety
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
    console.log("Starting migration 005: normalize tags system...");

    // Check if tags table already exists
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tags'
      )
    `);

    if (checkTable.rows[0].exists) {
      console.log("⏭️  Skipping: tags table already exists");
      return;
    }

    await client.query("BEGIN");

    // Step 1: Create tags table
    console.log("Step 1: Creating tags table...");
    await client.query(`
      CREATE TABLE tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Tags table created");

    // Step 2: Create quote_tags junction table
    console.log("Step 2: Creating quote_tags junction table...");
    await client.query(`
      CREATE TABLE quote_tags (
        quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (quote_id, tag_id)
      )
    `);
    console.log("✅ Quote_tags junction table created");

    // Step 3: Extract all existing tags from quotes
    console.log("Step 3: Extracting existing tags from quotes...");
    const quotesResult = await client.query(
      "SELECT id, tags FROM quotes WHERE tags IS NOT NULL AND tags != ''"
    );

    const tagSet = new Set();
    const quoteTagsMap = new Map(); // quote_id -> [tag_names]

    for (const quote of quotesResult.rows) {
      if (quote.tags && quote.tags.trim()) {
        const tags = quote.tags
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);

        quoteTagsMap.set(quote.id, tags);
        tags.forEach((tag) => tagSet.add(tag));
      }
    }

    console.log(`   Found ${tagSet.size} unique tags across ${quotesResult.rows.length} quotes`);

    // Step 4: Insert unique tags into tags table
    console.log("Step 4: Inserting tags into tags table...");
    const tagIdMap = new Map(); // tag_name -> tag_id

    for (const tagName of tagSet) {
      const result = await client.query(
        "INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name",
        [tagName]
      );
      tagIdMap.set(result.rows[0].name, result.rows[0].id);
    }
    console.log(`✅ Inserted ${tagSet.size} tags`);

    // Step 5: Populate quote_tags junction table
    console.log("Step 5: Populating quote_tags junction table...");
    let relationshipsCreated = 0;

    for (const [quoteId, tagNames] of quoteTagsMap.entries()) {
      for (const tagName of tagNames) {
        const tagId = tagIdMap.get(tagName);
        if (tagId) {
          await client.query(
            "INSERT INTO quote_tags (quote_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [quoteId, tagId]
          );
          relationshipsCreated++;
        }
      }
    }
    console.log(`✅ Created ${relationshipsCreated} quote-tag relationships`);

    // Step 6: Create indexes for performance
    console.log("Step 6: Creating indexes...");
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_quote_tags_quote_id ON quote_tags(quote_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_quote_tags_tag_id ON quote_tags(tag_id)"
    );
    console.log("✅ Indexes created");

    await client.query("COMMIT");

    console.log("✅ Migration 005 completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Unique tags: ${tagSet.size}`);
    console.log(`   - Quotes with tags: ${quotesResult.rows.length}`);
    console.log(`   - Tag relationships: ${relationshipsCreated}`);
    console.log("\n⚠️  Note: The old 'tags' column is preserved for safety.");
    console.log("   You can drop it later after verification:");
    console.log("   ALTER TABLE quotes DROP COLUMN tags;\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 005 failed:", error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}

module.exports = { migrate };
