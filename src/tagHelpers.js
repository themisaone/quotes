function getDefaultPool() {
  return require("./db");
}

function isSqlite(client, pool) {
  return client?.dialect === "sqlite" || pool?.dialect === "sqlite";
}

function rowBoolean(value) {
  return value === true || value === 1 || value === "1";
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

function createTagHelpers({ pool, logger = console } = {}) {
  const activePool = pool || getDefaultPool();
  let tablesExistCache = null;
  let typeColumnCache = null;

  async function checkTagTablesExist(forceRecheck = false) {
    if (tablesExistCache !== null && !forceRecheck) {
      return tablesExistCache;
    }

    try {
      const result = isSqlite(null, activePool)
        ? await activePool.query(`
          SELECT (
            (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'tags') > 0
            AND
            (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'note_tags') > 0
          ) AS tables_exist
        `)
        : await activePool.query(`
          SELECT
            (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tags')) AND
            (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'note_tags'))
            AS tables_exist
        `);
      tablesExistCache = rowBoolean(result.rows[0].tables_exist);
      return tablesExistCache;
    } catch (error) {
      logger.error("Error checking tag tables:", error);
      return false;
    }
  }

  async function checkTagTypeColumnExists(client, forceRecheck = false) {
    if (typeColumnCache !== null && !forceRecheck) {
      return typeColumnCache;
    }

    if (isSqlite(client, activePool)) {
      const result = await client.query("PRAGMA table_info(tags)");
      typeColumnCache = result.rows.some((row) => row.name === "type");
      return typeColumnCache;
    }

    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'tags' AND column_name = 'type'
      ) AS column_exists
    `);
    typeColumnCache = rowBoolean(result.rows[0].column_exists);
    return typeColumnCache;
  }

  /**
   * Get or create tags and return their IDs
   * @param {Array<string>} tagNames - Array of tag names
   * @param {string} noteType - Note type (quote, note, joke, puzzle, training)
   * @param {Object} client - Database client (for transactions)
   * @returns {Promise<Array<number>>} - Array of tag IDs
   */
  async function getOrCreateTagIds(tagNames, noteType = "quote", client = activePool) {
    if (!tagNames || tagNames.length === 0) {
      return [];
    }

    const hasNewTables = await checkTagTablesExist();
    if (!hasNewTables) {
      return [];
    }

    const hasTypeColumn = await checkTagTypeColumnExists(client);
    const tagIds = [];

    for (const tagName of tagNames) {
      const trimmedTag = tagName.trim();
      if (!trimmedTag) continue;

      try {
        let result;
        if (hasTypeColumn) {
          result = await client.query(
            `INSERT INTO tags (name, type)
             VALUES ($1, $2)
             ON CONFLICT (name, type) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [trimmedTag, noteType]
          );
        } else {
          result = await client.query(
            `INSERT INTO tags (name)
             VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [trimmedTag]
          );
        }
        tagIds.push(result.rows[0].id);
      } catch (error) {
        logger.error("Error creating tag:", trimmedTag, error);
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
  async function associateTagsWithNote(noteId, tagIds, client = activePool) {
    if (!tagIds || tagIds.length === 0) {
      return;
    }

    const hasNewTables = await checkTagTablesExist();
    if (!hasNewTables) {
      return;
    }

    await client.query("DELETE FROM note_tags WHERE note_id = $1", [noteId]);

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
      return [];
    }

    const result = await activePool.query(
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
      return new Map();
    }

    const result = await activePool.query(
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

  return {
    checkTagTablesExist,
    getOrCreateTagIds,
    associateTagsWithNote,
    getTagsForNote,
    getTagsForNotes,
    parseTagInput,
  };
}

let defaultHelpers = null;

function getDefaultHelpers() {
  if (!defaultHelpers) defaultHelpers = createTagHelpers();
  return defaultHelpers;
}

module.exports = {
  checkTagTablesExist: (...args) => getDefaultHelpers().checkTagTablesExist(...args),
  getOrCreateTagIds: (...args) => getDefaultHelpers().getOrCreateTagIds(...args),
  associateTagsWithNote: (...args) => getDefaultHelpers().associateTagsWithNote(...args),
  getTagsForNote: (...args) => getDefaultHelpers().getTagsForNote(...args),
  getTagsForNotes: (...args) => getDefaultHelpers().getTagsForNotes(...args),
  createTagHelpers,
  parseTagInput,
};
