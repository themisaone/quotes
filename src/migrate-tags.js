/**
 * ============================================================
 * ONE-TIME MIGRATION SCRIPT - Tags Normalization
 * ============================================================
 * 
 * PURPOSE:
 * This is a BACKUP migration script used ONCE to migrate from
 * the old tag system (comma-separated strings in notes.tags)
 * to the new normalized system (separate 'tags' and 'note_tags' tables).
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
 * 2. Creates 'note_tags' junction table (note_id, tag_id) if it doesn't exist
 * 3. Parses all comma-separated tags from notes.tags column
 * 4. Inserts unique tags into 'tags' table
 * 5. Creates relationships in 'note_tags' table
 * 6. Does NOT drop the old 'tags' column (preserved for safety)
 * 
 * SAFETY:
 * - Uses transactions (rolls back on error)
 * - Idempotent (can be run multiple times safely)
 * - Preserves original data in notes.tags column
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

    // Step 2: Create note_tags junction table
    console.log("2️⃣ Creating note_tags junction table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS note_tags (
        note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (note_id, tag_id)
      )
    `);
    console.log("✅ Note_tags junction table created\n");

    // Step 3: Extract all existing tags from notes
    console.log("3️⃣ Extracting existing tags from notes...");
    const notesResult = await client.query(
      "SELECT id, tags FROM notes WHERE tags IS NOT NULL AND tags != ''"
    );

    const tagSet = new Set();
    const noteTagsMap = new Map(); // note_id -> [tag_names]

    for (const note of notesResult.rows) {
      if (note.tags && note.tags.trim()) {
        const tags = note.tags
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);

        noteTagsMap.set(note.id, tags);
        tags.forEach((tag) => tagSet.add(tag));
      }
    }

    console.log(`   Found ${tagSet.size} unique tags across ${notesResult.rows.length} notes\n`);

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

    // Step 5: Populate note_tags junction table
    console.log("5️⃣ Populating note_tags junction table...");
    let relationshipsCreated = 0;

    for (const [noteId, tagNames] of noteTagsMap.entries()) {
      for (const tagName of tagNames) {
        const tagId = tagIdMap.get(tagName);
        if (tagId) {
          await client.query(
            "INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [noteId, tagId]
          );
          relationshipsCreated++;
        }
      }
    }
    console.log(`✅ Created ${relationshipsCreated} note-tag relationships\n`);

    // Step 6: Create indexes for performance
    console.log("6️⃣ Creating indexes...");
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id)"
    );
    console.log("✅ Indexes created\n");

    await client.query("COMMIT");

    console.log("🎉 Migration completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Unique tags: ${tagSet.size}`);
    console.log(`   - Notes with tags: ${notesResult.rows.length}`);
    console.log(`   - Tag relationships: ${relationshipsCreated}`);
    console.log("\n⚠️  Note: The old 'tags' column in notes table is preserved for now.");
    console.log("   You can drop it later after verifying everything works:");
    console.log("   ALTER TABLE notes DROP COLUMN tags;\n");
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
