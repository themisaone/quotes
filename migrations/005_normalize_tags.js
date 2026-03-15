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
    const junctionTableName = tableName === 'notes' ? 'note_tags' : 'quote_tags';
    const foreignKeyColumn = tableName === 'notes' ? 'note_id' : 'quote_id';

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

    // Step 2: Create junction table (note_tags or quote_tags)
    console.log(`Step 2: Creating ${junctionTableName} junction table...`);
    await client.query(`
      CREATE TABLE ${junctionTableName} (
        ${foreignKeyColumn} INTEGER REFERENCES ${tableName}(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (${foreignKeyColumn}, tag_id)
      )
    `);
    console.log(`✅ ${junctionTableName} junction table created`);

    // Step 3: Extract all existing tags
    console.log(`Step 3: Extracting existing tags from ${tableName}...`);
    const quotesResult = await client.query(
      `SELECT id, tags FROM ${tableName} WHERE tags IS NOT NULL AND tags != ''`
    );

    const tagSet = new Set();
    const quoteTagsMap = new Map(); // id -> [tag_names]

    for (const note of quotesResult.rows) {
      if (note.tags && note.tags.trim()) {
        const tags = note.tags
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);

        quoteTagsMap.set(note.id, tags);
        tags.forEach((tag) => tagSet.add(tag));
      }
    }

    console.log(`   Found ${tagSet.size} unique tags across ${quotesResult.rows.length} ${tableName}`);

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

    // Step 5: Populate junction table
    console.log(`Step 5: Populating ${junctionTableName} junction table...`);
    let relationshipsCreated = 0;

    for (const [quoteId, tagNames] of quoteTagsMap.entries()) {
      for (const tagName of tagNames) {
        const tagId = tagIdMap.get(tagName);
        if (tagId) {
          await client.query(
            `INSERT INTO ${junctionTableName} (${foreignKeyColumn}, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [quoteId, tagId]
          );
          relationshipsCreated++;
        }
      }
    }
    console.log(`✅ Created ${relationshipsCreated} ${tableName}-tag relationships`);

    // Step 6: Create indexes for performance
    console.log("Step 6: Creating indexes...");
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)"
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_${junctionTableName}_${foreignKeyColumn} ON ${junctionTableName}(${foreignKeyColumn})`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_${junctionTableName}_tag_id ON ${junctionTableName}(tag_id)`
    );
    console.log("✅ Indexes created");

    await client.query("COMMIT");

    console.log("✅ Migration 005 completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Unique tags: ${tagSet.size}`);
    console.log(`   - ${tableName} with tags: ${quotesResult.rows.length}`);
    console.log(`   - Tag relationships: ${relationshipsCreated}`);
    console.log("\n⚠️  Note: The old 'tags' column is preserved for safety.");
    console.log("   You can drop it later after verification:");
    console.log(`   ALTER TABLE ${tableName} DROP COLUMN tags;\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration 005 failed:", error.message);
    throw error;
  } finally {
    client.release();
    // Don't end pool here - let the migration runner handle it
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error:", error);
      pool.end();
      process.exit(1);
    });
}

module.exports = { migrate };
