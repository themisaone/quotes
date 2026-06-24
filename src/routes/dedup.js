const {
  enrichNoteListResponse,
} = require("../quoteResponse");

const DEDUP_GROUPS_SQL = `
      WITH annotated AS (
        SELECT
          n.id,
          md5(concat_ws(E'\\x1e',
            COALESCE(n.note_type, ''),
            COALESCE(n.type, ''),
            COALESCE(n.note_date::text, ''),
            COALESCE(n.note_text, ''),
            COALESCE(n.comment, ''),
            COALESCE(n.note_title, ''),
            COALESCE(n.translation_group, ''),
            COALESCE(a.name, ''),
            COALESCE(s.name, '')
          )) AS dup_key
        FROM notes n
        LEFT JOIN authors a ON a.id = n.author_id
        LEFT JOIN sources s ON s.id = n.source_id
        WHERE char_length(
          trim(regexp_replace(COALESCE(n.note_text, ''), '<[^>]+>', '', 'gi'))
        ) > 0
      ),
      grouped AS (
        SELECT dup_key,
               array_agg(id ORDER BY id) AS ids,
               COUNT(*)::int AS cnt
        FROM annotated
        GROUP BY dup_key
        HAVING COUNT(*) > 1
      )
      SELECT dup_key, ids, cnt FROM grouped
      ORDER BY cnt DESC, ids[1] ASC
      LIMIT $1 OFFSET $2
    `;

const DEDUP_NOTES_SQL = `
      SELECT q.*,
             a.name AS author_name, a.image AS author_image,
             s.name AS source_name, s.image AS source_image, q.type AS source_type
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = ANY($1::int[])
    `;

function parseDedupLimit(value) {
  return Math.min(Math.max(parseInt(value, 10) || 40, 1), 100);
}

function parseDedupOffset(value) {
  return Math.max(parseInt(value, 10) || 0, 0);
}

function registerDedupRoutes(app, {
  pool,
  getAttachmentsForNotes,
  applyAttachments,
  retrieveQuoteImages,
  checkTagTablesExist,
  getTagsForNotes,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");
  if (!getAttachmentsForNotes) throw new Error("getAttachmentsForNotes is required");
  if (!applyAttachments) throw new Error("applyAttachments is required");
  if (!retrieveQuoteImages) throw new Error("retrieveQuoteImages is required");
  if (!checkTagTablesExist) throw new Error("checkTagTablesExist is required");
  if (!getTagsForNotes) throw new Error("getTagsForNotes is required");

  app.get("/api/dedup/suspects", async (req, res) => {
    try {
      const limit = parseDedupLimit(req.query.limit);
      const offset = parseDedupOffset(req.query.offset);

      const groupsResult = await pool.query(DEDUP_GROUPS_SQL, [limit, offset]);
      if (groupsResult.rows.length === 0) {
        return res.json({ groups: [], limit, offset });
      }

      const allIds = [...new Set(groupsResult.rows.flatMap((group) => group.ids))];
      const notesResult = await pool.query(DEDUP_NOTES_SQL, [allIds]);

      const enrichedNotes = await enrichNoteListResponse(notesResult.rows, {
        getAttachmentsForNotes,
        checkTagTablesExist,
        getTagsForNotes,
        retrieveQuoteImages,
        applyAttachments,
      });
      const idToRow = new Map(enrichedNotes.map((row) => [row.id, row]));

      const groups = groupsResult.rows.map((group) => ({
        dup_key: group.dup_key,
        ids: group.ids,
        count: group.cnt,
        notes: group.ids.map((id) => idToRow.get(id)).filter(Boolean),
      }));

      res.json({ groups, limit, offset });
    } catch (error) {
      logger.error("Error fetching dedup suspects:", error);
      res.status(500).json({ error: "Failed to fetch duplicate suspects" });
    }
  });
}

module.exports = {
  DEDUP_GROUPS_SQL,
  DEDUP_NOTES_SQL,
  parseDedupLimit,
  parseDedupOffset,
  registerDedupRoutes,
};
