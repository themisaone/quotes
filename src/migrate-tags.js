/**
 * ============================================================
 * ONE-TIME MIGRATION SCRIPT - Tags Normalization
 * ============================================================
 * 
 * PURPOSE:
 * This is a BACKUP migration script used ONCE to migrate from
 * the old tag system (comma-separated strings in quotes.tags)
 * to the new normalized system (separate 'tags' and 'quote_tags' tables).
 * 
 * USAGE:
 * This script was run once during the migration and is kept here
 * for reference and rollback purposes only. It is NOT part of
 * the normal migration flow in migrations/run-migrations.js.
 * 
 * To run manually (if needed for rollback/testing):
 *   node src/migrate-tags.js
 * 
 * WHAT IT DOES:
 * 1. Creates 'tags' table (id, name) if it doesn't exist
 * 2. Creates 'quote_tags' junction table (quote_id, tag_id) if it doesn't exist
 * 3. Parses all comma-separated tags from quotes.tags column
 * 4. Inserts unique tags into 'tags' table
 * 5. Creates relationships in 'quote_tags' table
 * 6. Does NOT drop the old 'tags' column (preserved for safety)
 * 
 * SAFETY:
 * - Uses transactions (rolls back on error)
 * - Idempotent (can be run multiple times safely)
 * - Preserves original data in quotes.tags column
 * 
 * STATUS: ✅ COMPLETED - No longer part of active codebase
 * ============================================================
 */

const pool = require("./db");

async function migrateTags() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("🚀 Starting tags migration...\n");

    // Step 1: Create tags table
    console.log("1️⃣ Creating tags table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Tags table created\n");

    // Step 2: Create quote_tags junction table
    console.log("2️⃣ Creating quote_tags junction table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_tags (
        quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (quote_id, tag_id)
      )
    `);
    console.log("✅ Quote_tags junction table created\n");

    // Step 3: Extract all existing tags from quotes
    console.log("3️⃣ Extracting existing tags from quotes...");
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

    console.log(`   Found ${tagSet.size} unique tags across ${quotesResult.rows.length} quotes\n`);

    // Step 4: Insert unique tags into tags table
    console.log("4️⃣ Inserting tags into tags table...");
    const tagIdMap = new Map(); // tag_name -> tag_id

    for (const tagName of tagSet) {
      const result = await client.query(
        "INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name",
        [tagName]
      );
      tagIdMap.set(result.rows[0].name, result.rows[0].id);
    }
    console.log(`✅ Inserted ${tagSet.size} tags\n`);

    // Step 5: Populate quote_tags junction table
    console.log("5️⃣ Populating quote_tags junction table...");
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
    console.log(`✅ Created ${relationshipsCreated} quote-tag relationships\n`);

    // Step 6: Create indexes for performance
    console.log("6️⃣ Creating indexes...");
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_quote_tags_quote_id ON quote_tags(quote_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_quote_tags_tag_id ON quote_tags(tag_id)"
    );
    console.log("✅ Indexes created\n");

    await client.query("COMMIT");

    console.log("🎉 Migration completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Unique tags: ${tagSet.size}`);
    console.log(`   - Quotes with tags: ${quotesResult.rows.length}`);
    console.log(`   - Tag relationships: ${relationshipsCreated}`);
    console.log("\n⚠️  Note: The old 'tags' column in quotes table is preserved for now.");
    console.log("   You can drop it later after verifying everything works:");
    console.log("   ALTER TABLE quotes DROP COLUMN tags;\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
migrateTags()
  .then(() => {
    console.log("✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
