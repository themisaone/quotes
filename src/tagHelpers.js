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
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'quote_tags')) 
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
 * @param {Object} client - Database client (for transactions)
 * @returns {Promise<Array<number>>} - Array of tag IDs
 */
async function getOrCreateTagIds(tagNames, client = pool) {
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
      const result = await client.query(
        `INSERT INTO tags (name) 
         VALUES ($1) 
         ON CONFLICT (name) DO UPDATE SET name = tags.name
         RETURNING id`,
        [trimmedTag]
      );
      tagIds.push(result.rows[0].id);
    } catch (error) {
      console.error("Error creating tag:", trimmedTag, error);
    }
  }

  return tagIds;
}

/**
 * Associate tags with a quote
 * @param {number} quoteId - Quote ID
 * @param {Array<number>} tagIds - Array of tag IDs
 * @param {Object} client - Database client (for transactions)
 */
async function associateTagsWithQuote(quoteId, tagIds, client = pool) {
  if (!tagIds || tagIds.length === 0) {
    return;
  }

  const hasNewTables = await checkTagTablesExist();
  if (!hasNewTables) {
    return; // Skip if tables don't exist yet
  }

  // First, remove all existing associations for this quote
  await client.query("DELETE FROM quote_tags WHERE quote_id = $1", [quoteId]);

  // Then create new associations
  for (const tagId of tagIds) {
    await client.query(
      `INSERT INTO quote_tags (quote_id, tag_id) 
       VALUES ($1, $2) 
       ON CONFLICT DO NOTHING`,
      [quoteId, tagId]
    );
  }
}

/**
 * Get tags for a quote
 * @param {number} quoteId - Quote ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
async function getTagsForQuote(quoteId) {
  const hasNewTables = await checkTagTablesExist();
  if (!hasNewTables) {
    return []; // Return empty if tables don't exist yet
  }

  const result = await pool.query(
    `SELECT t.id, t.name
     FROM tags t
     JOIN quote_tags qt ON t.id = qt.tag_id
     WHERE qt.quote_id = $1
     ORDER BY t.name`,
    [quoteId]
  );
  return result.rows;
}

/**
 * Get tags for multiple quotes (efficient batch query)
 * @param {Array<number>} quoteIds - Array of quote IDs
 * @returns {Promise<Map<number, Array<{id: number, name: string}>>>}
 */
async function getTagsForQuotes(quoteIds) {
  if (!quoteIds || quoteIds.length === 0) {
    return new Map();
  }

  const hasNewTables = await checkTagTablesExist();
  if (!hasNewTables) {
    return new Map(); // Return empty map if tables don't exist yet
  }

  const result = await pool.query(
    `SELECT qt.quote_id, t.id, t.name
     FROM tags t
     JOIN quote_tags qt ON t.id = qt.tag_id
     WHERE qt.quote_id = ANY($1)
     ORDER BY qt.quote_id, t.name`,
    [quoteIds]
  );

  const tagsMap = new Map();
  for (const row of result.rows) {
    if (!tagsMap.has(row.quote_id)) {
      tagsMap.set(row.quote_id, []);
    }
    tagsMap.get(row.quote_id).push({ id: row.id, name: row.name });
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
  associateTagsWithQuote,
  getTagsForQuote,
  getTagsForQuotes,
  parseTagInput,
};
