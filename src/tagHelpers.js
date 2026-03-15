const pool = require("./db");

// Cache for table existence check (avoid repeated queries)
let tablesExistCache = null;

/**
 * Check if new tag tables exist
 * @param {boolean} forceRecheck - Force recheck even if cached
 * @returns {Promise<boolean>}
 */
async function checkTagTablesExist(forceRecheck = false) {
  // Return cached result if available and not forcing recheck
  if (tablesExistCache !== null && !forceRecheck) {
    return tablesExistCache;
  }
  
  try {
    const result = await pool.query(`
      SELECT 
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tags')) AND
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'note_tags')) 
        AS exists
    `);
    tablesExistCache = result.rows[0].exists;
    return tablesExistCache;
  } catch (error) {
    console.error("Error checking tag tables:", error);
    return false;
  }
}

/**
 * Get or create tags and return their IDs
 * @param {Array<string>} tagNames - Array of tag names
 * @param {string} noteType - Note type (quote, note, joke, puzzle, training)
 * @param {Object} client - Database client (for transactions)
 * @returns {Promise<Array<number>>} - Array of tag IDs
 */
async function getOrCreateTagIds(tagNames, noteType = 'quote', client = pool) {
  if (!tagNames || tagNames.length === 0) {
    return [];
  }

  const hasNewTables = await checkTagTablesExist();
  if (!hasNewTables) {
    return []; // Skip if tables don't exist yet
  }

  const tagIds = [];

  for (const tagName of tagNames) {
    const trimmedTag = tagName.trim();
    if (!trimmedTag) continue;

    try {
      // Check if type column exists
      const hasTypeColumn = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'tags' AND column_name = 'type'
        )
      `);

      let result;
      if (hasTypeColumn.rows[0].exists) {
        // New schema with type column - unique constraint is on (name, type)
        result = await client.query(
          `INSERT INTO tags (name, type) 
           VALUES ($1, $2) 
           ON CONFLICT (name, type) DO UPDATE SET name = tags.name
           RETURNING id`,
          [trimmedTag, noteType]
        );
      } else {
        // Old schema without type column - unique constraint is on name only
        result = await client.query(
          `INSERT INTO tags (name) 
           VALUES ($1) 
           ON CONFLICT (name) DO UPDATE SET name = tags.name
           RETURNING id`,
          [trimmedTag]
        );
      }
      tagIds.push(result.rows[0].id);
    } catch (error) {
      console.error("Error creating tag:", trimmedTag, error);
    }
  }

  return tagIds;
}

/**
 * Associate tags with a note
 * @param {number} noteId - Note ID
 * @param {Array<number>} tagIds - Array of tag IDs
 * @param {Object} client - Database client (for transactions)
 */
async function associateTagsWithNote(noteId, tagIds, client = pool) {
  if (!tagIds || tagIds.length === 0) {
    return;
  }

  const hasNewTables = await checkTagTablesExist();
  if (!hasNewTables) {
    return; // Skip if tables don't exist yet
  }

  // First, remove all existing associations for this note
  await client.query("DELETE FROM note_tags WHERE note_id = $1", [noteId]);

  // Then create new associations
  for (const tagId of tagIds) {
    await client.query(
      `INSERT INTO note_tags (note_id, tag_id) 
       VALUES ($1, $2) 
       ON CONFLICT DO NOTHING`,
      [noteId, tagId]
    );
  }
}

/**
 * Get tags for a note
 * @param {number} noteId - Note ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
async function getTagsForNote(noteId) {
  const hasNewTables = await checkTagTablesExist();
  if (!hasNewTables) {
    return []; // Return empty if tables don't exist yet
  }

  const result = await pool.query(
    `SELECT t.id, t.name
     FROM tags t
     JOIN note_tags nt ON t.id = nt.tag_id
     WHERE nt.note_id = $1
     ORDER BY t.name`,
    [noteId]
  );
  return result.rows;
}

/**
 * Get tags for multiple notes (efficient batch query)
 * @param {Array<number>} noteIds - Array of note IDs
 * @returns {Promise<Map<number, Array<{id: number, name: string}>>>}
 */
async function getTagsForNotes(noteIds) {
  if (!noteIds || noteIds.length === 0) {
    return new Map();
  }

  const hasNewTables = await checkTagTablesExist();
  if (!hasNewTables) {
    return new Map(); // Return empty map if tables don't exist yet
  }

  const result = await pool.query(
    `SELECT nt.note_id, t.id, t.name
     FROM tags t
     JOIN note_tags nt ON t.id = nt.tag_id
     WHERE nt.note_id = ANY($1)
     ORDER BY nt.note_id, t.name`,
    [noteIds]
  );

  const tagsMap = new Map();
  for (const row of result.rows) {
    if (!tagsMap.has(row.note_id)) {
      tagsMap.set(row.note_id, []);
    }
    tagsMap.get(row.note_id).push({ id: row.id, name: row.name });
  }

  return tagsMap;
}

/**
 * Parse tag input (comma-separated string or array)
 * @param {string|Array<string>} tagsInput
 * @returns {Array<string>}
 */
function parseTagInput(tagsInput) {
  if (!tagsInput) return [];

  if (Array.isArray(tagsInput)) {
    return tagsInput.map((t) => t.trim()).filter((t) => t);
  }

  if (typeof tagsInput === "string") {
    return tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
  }

  return [];
}

module.exports = {
  checkTagTablesExist,
  getOrCreateTagIds,
  associateTagsWithNote,
  getTagsForNote,
  getTagsForNotes,
  parseTagInput,
};
