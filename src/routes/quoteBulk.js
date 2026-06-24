const {
  buildBulkFilterQuery,
} = require("../quoteListQuery");
const {
  rollbackAndStatusJson,
  rollbackAndJson,
} = require("../transactionResponses");

function parseIdList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((id) => parseInt(id, 10)).filter(Number.isFinite);
}

function hasExplicitIds(values) {
  return Array.isArray(values) && values.length > 0;
}

function buildExcludeSet(values) {
  return new Set(parseIdList(values));
}

function applyExcludeSet(ids, excludeSet) {
  return excludeSet.size > 0 ? ids.filter((id) => !excludeSet.has(id)) : ids;
}

function rememberCopiedAttachment(copiedRefs, originalRef, copiedRef) {
  if (copiedRef && copiedRef !== originalRef) {
    copiedRefs.add(copiedRef);
  }
  return copiedRef;
}

function cleanupCopiedAttachments({ fileStorage, copiedRefs, logger, label }) {
  for (const ref of copiedRefs) {
    try {
      fileStorage.deleteAttachment(ref);
    } catch (cleanupError) {
      logger.error(`${label} copied-file cleanup failed:`, cleanupError);
    }
  }
}

function deletePendingAttachments({ fileStorage, refs, logger, label }) {
  for (const ref of refs) {
    try {
      fileStorage.deleteAttachment(ref);
    } catch (deleteError) {
      logger.error(`${label} post-commit file delete failed:`, deleteError);
    }
  }
}

function registerQuoteBulkRoutes(app, {
  pool,
  fileStorage,
  getAllowedTypes,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");
  if (!fileStorage) throw new Error("fileStorage is required");
  if (!getAllowedTypes) throw new Error("getAllowedTypes is required");

  function currentAllowedTypes() {
    return typeof getAllowedTypes === "function" ? getAllowedTypes() : getAllowedTypes;
  }

  async function resolveQuoteIds(client, { filters, noteIds }) {
    if (hasExplicitIds(noteIds)) {
      return parseIdList(noteIds);
    }

    const { query, params } = buildBulkFilterQuery(filters, currentAllowedTypes());
    const result = await client.query(`SELECT q.id ${query}`, params);
    return result.rows.map((row) => row.id);
  }

  // Return note IDs matching filters for select-all flows with exclusions.
  app.post("/api/quotes/ids", async (req, res) => {
    try {
      const { filters } = req.body || {};
      const { query, params } = buildBulkFilterQuery(filters || {}, currentAllowedTypes());
      const result = await pool.query(`SELECT q.id ${query}`, params);
      res.json({ ids: result.rows.map((row) => row.id) });
    } catch (error) {
      logger.error("Error fetching filtered note IDs:", error);
      res.status(500).json({ error: "Failed to fetch note IDs" });
    }
  });

  // Get count of filtered quotes for bulk operation previews.
  app.post("/api/quotes/bulk-count", async (req, res) => {
    try {
      const { filters, noteIds } = req.body || {};

      if (hasExplicitIds(noteIds)) {
        const result = await pool.query(
          `SELECT COUNT(*) as count FROM notes WHERE id = ANY($1::int[])`,
          [parseIdList(noteIds)]
        );
        return res.json({ count: parseInt(result.rows[0].count) });
      }

      const { query, params } = buildBulkFilterQuery(filters, currentAllowedTypes());
      const result = await pool.query(`SELECT COUNT(*) as count ${query}`, params);
      res.json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
      logger.error("Error counting filtered quotes:", error);
      res.status(500).json({ error: "Failed to count quotes" });
    }
  });

  // Bulk tag operation.
  app.post("/api/quotes/bulk-tag", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { filters, tagName, noteIds, noteType: explicitNoteType } = req.body || {};

      if (!tagName || !tagName.trim()) {
        return rollbackAndStatusJson(client, res, 400, { error: "Tag name is required" });
      }

      const quoteIds = await resolveQuoteIds(client, { filters, noteIds });
      if (quoteIds.length === 0) {
        return rollbackAndJson(client, res, { count: 0, message: "No notes match" });
      }

      const noteType = explicitNoteType || filters?.note_type || "quote";
      const tagResult = await client.query(
        `INSERT INTO tags (name, type) 
       VALUES ($1, $2) 
       ON CONFLICT (name, type) DO UPDATE SET name = tags.name
       RETURNING id`,
        [tagName.trim(), noteType]
      );
      const tagId = tagResult.rows[0].id;

      let taggedCount = 0;
      for (const quoteId of quoteIds) {
        const insertResult = await client.query(
          `INSERT INTO note_tags (note_id, tag_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING
         RETURNING *`,
          [quoteId, tagId]
        );
        if (insertResult.rows.length > 0) {
          taggedCount++;
        }
      }

      await client.query("COMMIT");

      res.json({
        count: taggedCount,
        total: quoteIds.length,
        message: `Tagged ${taggedCount} quotes (${quoteIds.length - taggedCount} already had this tag)`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error in bulk tag operation:", error);
      res.status(500).json({ error: "Failed to tag quotes" });
    } finally {
      client.release();
    }
  });

  // Bulk set translation group.
  app.post("/api/quotes/bulk-set-group", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { filters, groupName, noteIds } = req.body || {};

      if (!groupName || !groupName.trim()) {
        return rollbackAndStatusJson(client, res, 400, { error: "Group name is required" });
      }

      const quoteIds = await resolveQuoteIds(client, { filters, noteIds });
      if (quoteIds.length === 0) {
        return rollbackAndJson(client, res, { count: 0, message: "No notes match" });
      }

      await client.query(
        `UPDATE notes SET translation_group = $1 WHERE id = ANY($2::int[])`,
        [groupName.trim(), quoteIds]
      );

      await client.query("COMMIT");
      res.json({ count: quoteIds.length, message: `Set group on ${quoteIds.length} notes` });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error in bulk set-group:", error);
      res.status(500).json({ error: "Failed to set group" });
    } finally {
      client.release();
    }
  });

  // Bulk set generic sub-type (notes.type) on selected notes.
  app.post("/api/quotes/bulk-set-subtype", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { filters, subType, noteIds, noteType: explicitNoteType } = req.body || {};

      if (!subType || !String(subType).trim()) {
        return rollbackAndStatusJson(client, res, 400, { error: "Sub-type is required" });
      }
      const subTypeValue = String(subType).trim();

      const quoteIds = await resolveQuoteIds(client, { filters, noteIds });
      if (quoteIds.length === 0) {
        return rollbackAndJson(client, res, { count: 0, message: "No notes match" });
      }

      let updateSql = `UPDATE notes SET type = $1 WHERE id = ANY($2::int[])`;
      const updateParams = [subTypeValue, quoteIds];
      if (explicitNoteType) {
        updateSql += ` AND note_type = $3`;
        updateParams.push(explicitNoteType);
      }
      const updateResult = await client.query(
        `${updateSql} RETURNING id`,
        updateParams
      );

      await client.query("COMMIT");
      res.json({
        count: updateResult.rowCount,
        total: quoteIds.length,
        message: `Set sub-type on ${updateResult.rowCount} notes`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error in bulk set-subtype:", error);
      res.status(500).json({ error: "Failed to set sub-type" });
    } finally {
      client.release();
    }
  });

  // Bulk untag operation.
  app.post("/api/quotes/bulk-untag", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { filters, tagName, noteIds, noteType: explicitNoteType } = req.body || {};

      if (!tagName || !tagName.trim()) {
        return rollbackAndStatusJson(client, res, 400, { error: "Tag name is required" });
      }

      const quoteIds = await resolveQuoteIds(client, { filters, noteIds });
      if (quoteIds.length === 0) {
        return rollbackAndJson(client, res, { count: 0, message: "No notes match" });
      }

      const noteType = explicitNoteType || filters?.note_type || "quote";
      const tagResult = await client.query(
        `SELECT id FROM tags WHERE name = $1 AND type = $2`,
        [tagName.trim(), noteType]
      );

      if (tagResult.rows.length === 0) {
        return rollbackAndJson(
          client,
          res,
          { count: 0, message: `Tag "${tagName}" not found for type "${noteType}"` }
        );
      }

      const tagId = tagResult.rows[0].id;
      const deleteResult = await client.query(
        `DELETE FROM note_tags 
       WHERE tag_id = $1 AND note_id = ANY($2)
       RETURNING *`,
        [tagId, quoteIds]
      );

      await client.query("COMMIT");

      res.json({
        count: deleteResult.rowCount,
        total: quoteIds.length,
        message: `Removed tag from ${deleteResult.rowCount} notes (${quoteIds.length - deleteResult.rowCount} didn't have this tag)`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error in bulk untag operation:", error);
      res.status(500).json({ error: "Failed to remove tag from notes" });
    } finally {
      client.release();
    }
  });

  // Bulk duplicate operation.
  app.post("/api/quotes/bulk-duplicate", async (req, res) => {
    const client = await pool.connect();
    const copiedAttachmentRefs = new Set();
    try {
      await client.query("BEGIN");

      const { filters, noteIds, excludeIds } = req.body || {};
      const excludeSet = buildExcludeSet(excludeIds);
      const quoteIds = applyExcludeSet(
        await resolveQuoteIds(client, { filters, noteIds }),
        excludeSet
      );

      if (quoteIds.length === 0) {
        return rollbackAndJson(client, res, { count: 0, message: "No notes match" });
      }

      for (const oldId of quoteIds) {
        const noteRes = await client.query(
          `SELECT note_text, note_title, author_id, source_id, type, score, thumbnail, attachment_full,
                attachment_type, attachment_filename, comment, translation_group, note_type, note_date
         FROM notes WHERE id = $1`,
          [oldId]
        );
        if (noteRes.rows.length === 0) continue;
        const orig = noteRes.rows[0];

        const insertRes = await client.query(
          `INSERT INTO notes
           (note_text, note_title, author_id, source_id, type, score, thumbnail, attachment_full,
            attachment_type, attachment_filename, comment, translation_group, note_type, note_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
          [
            orig.note_text,
            orig.note_title,
            orig.author_id,
            orig.source_id,
            orig.type,
            orig.score,
            orig.thumbnail,
            orig.attachment_full,
            orig.attachment_type,
            orig.attachment_filename,
            orig.comment,
            orig.translation_group,
            orig.note_type,
            orig.note_date,
          ]
        );
        const newId = insertRes.rows[0].id;

        const newThumb = rememberCopiedAttachment(
          copiedAttachmentRefs,
          orig.thumbnail,
          fileStorage.copyAttachmentFile(orig.thumbnail, oldId, newId)
        );
        const newFull = rememberCopiedAttachment(
          copiedAttachmentRefs,
          orig.attachment_full,
          fileStorage.copyAttachmentFile(orig.attachment_full, oldId, newId)
        );
        if (newThumb !== orig.thumbnail || newFull !== orig.attachment_full) {
          await client.query(
            `UPDATE notes SET thumbnail = $1, attachment_full = $2 WHERE id = $3`,
            [newThumb, newFull, newId]
          );
        }

        const attRes = await client.query(
          `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
          [oldId]
        );
        for (const att of attRes.rows) {
          let newAttThumb;
          let newAttFull;

          if (att.position === 0) {
            newAttThumb = newThumb;
            newAttFull = newFull;
          } else {
            const oldKey = `${oldId}_a${att.position}`;
            const newKey = `${newId}_a${att.position}`;
            newAttThumb = rememberCopiedAttachment(
              copiedAttachmentRefs,
              att.thumbnail,
              fileStorage.copyAttachmentFile(att.thumbnail, oldKey, newKey)
            );
            newAttFull = rememberCopiedAttachment(
              copiedAttachmentRefs,
              att.attachment_full,
              fileStorage.copyAttachmentFile(att.attachment_full, oldKey, newKey)
            );
          }

          await client.query(
            `INSERT INTO note_attachments
             (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [newId, att.position, newAttThumb, newAttFull, att.attachment_type, att.storage_type, att.filename]
          );
        }

        await client.query(
          `INSERT INTO note_tags (note_id, tag_id)
         SELECT $1, tag_id FROM note_tags WHERE note_id = $2
         ON CONFLICT DO NOTHING`,
          [newId, oldId]
        );
      }

      await client.query("COMMIT");
      res.json({
        count: quoteIds.length,
        message: `Duplicated ${quoteIds.length} note${quoteIds.length !== 1 ? "s" : ""}`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      cleanupCopiedAttachments({
        fileStorage,
        copiedRefs: copiedAttachmentRefs,
        logger,
        label: "bulk-duplicate",
      });
      logger.error("Error in bulk-duplicate:", error);
      res.status(500).json({ error: "Failed to duplicate notes" });
    } finally {
      client.release();
    }
  });

  // Bulk split operation.
  app.post("/api/quotes/bulk-split", async (req, res) => {
    const client = await pool.connect();
    const copiedAttachmentRefs = new Set();
    const pendingOriginalDeletes = [];
    try {
      await client.query("BEGIN");

      const { filters, noteIds, excludeIds } = req.body || {};
      const excludeSet = buildExcludeSet(excludeIds);
      const quoteIds = applyExcludeSet(
        await resolveQuoteIds(client, { filters, noteIds }),
        excludeSet
      );

      if (quoteIds.length === 0) {
        return rollbackAndJson(
          client,
          res,
          { splitCount: 0, newNotes: 0, message: "No notes match" }
        );
      }

      let splitCount = 0;
      let newNotes = 0;

      for (const origId of quoteIds) {
        const noteRes = await client.query(
          `SELECT note_text, note_title, author_id, source_id, type, score, comment,
                translation_group, note_type, note_date
         FROM notes WHERE id = $1`,
          [origId]
        );
        if (noteRes.rows.length === 0) continue;
        const orig = noteRes.rows[0];

        const attRes = await client.query(
          `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
          [origId]
        );
        const atts = attRes.rows;
        if (atts.length < 2) continue;

        splitCount++;

        for (let i = 1; i < atts.length; i++) {
          const att = atts[i];

          const insRes = await client.query(
            `INSERT INTO notes
             (note_text, note_title, author_id, source_id, type, score, comment,
              translation_group, note_type, note_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
            [
              orig.note_text,
              orig.note_title,
              orig.author_id,
              orig.source_id,
              orig.type,
              orig.score,
              orig.comment,
              orig.translation_group,
              orig.note_type,
              orig.note_date,
            ]
          );
          const newId = insRes.rows[0].id;

          const newAttThumb = att.thumbnail;
          let newAttFull = fileStorage.copyAttachmentFile(att.attachment_full, `${origId}_a${att.position}`, String(newId));
          if (newAttFull === att.attachment_full) {
            newAttFull = fileStorage.copyAttachmentFile(att.attachment_full, `${origId}_${att.position}`, String(newId));
          }
          if (newAttFull === att.attachment_full) {
            newAttFull = fileStorage.copyAttachmentFile(att.attachment_full, String(origId), String(newId));
          }
          rememberCopiedAttachment(copiedAttachmentRefs, att.attachment_full, newAttFull);

          await client.query(
            `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
            [newAttThumb, newAttFull, att.attachment_type, newId]
          );

          await client.query(
            `INSERT INTO note_attachments
             (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
           VALUES ($1, 0, $2, $3, $4, $5, $6)`,
            [newId, newAttThumb, newAttFull, att.attachment_type, att.storage_type, att.filename]
          );

          await client.query(
            `INSERT INTO note_tags (note_id, tag_id)
           SELECT $1, tag_id FROM note_tags WHERE note_id = $2
           ON CONFLICT DO NOTHING`,
            [newId, origId]
          );

          newNotes++;
        }

        for (let i = 1; i < atts.length; i++) {
          const att = atts[i];
          if (att.thumbnail) pendingOriginalDeletes.push(att.thumbnail);
          if (att.attachment_full) pendingOriginalDeletes.push(att.attachment_full);
          await client.query(`DELETE FROM note_attachments WHERE id = $1`, [att.id]);
        }

        await client.query(
          `UPDATE note_attachments SET position = pos_rank - 1
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS pos_rank
               FROM note_attachments WHERE note_id = $1) ranked
         WHERE note_attachments.id = ranked.id`,
          [origId]
        );

        const firstAtt = atts[0];
        await client.query(
          `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
          [firstAtt.thumbnail, firstAtt.attachment_full, firstAtt.attachment_type, origId]
        );
      }

      await client.query("COMMIT");
      deletePendingAttachments({
        fileStorage,
        refs: pendingOriginalDeletes,
        logger,
        label: "bulk-split",
      });
      res.json({
        splitCount,
        newNotes,
        message: splitCount === 0
          ? "No multi-attachment notes found to split"
          : `Split ${splitCount} note${splitCount !== 1 ? "s" : ""} → created ${newNotes} new note${newNotes !== 1 ? "s" : ""}`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      cleanupCopiedAttachments({
        fileStorage,
        copiedRefs: copiedAttachmentRefs,
        logger,
        label: "bulk-split",
      });
      logger.error("Error in bulk-split:", error);
      res.status(500).json({ error: "Failed to split notes" });
    } finally {
      client.release();
    }
  });

  // Bulk delete operation.
  app.post("/api/quotes/bulk-delete", async (req, res) => {
    const client = await pool.connect();
    const pendingDeletes = [];
    try {
      await client.query("BEGIN");

      const { filters, noteIds, excludeIds } = req.body || {};
      const excludeSet = buildExcludeSet(excludeIds);
      let notesResult;

      if (hasExplicitIds(noteIds)) {
        const ids = parseIdList(noteIds);
        notesResult = ids.length > 0
          ? await client.query(
            `SELECT id, thumbnail, attachment_full FROM notes WHERE id = ANY($1::int[])`,
            [ids]
          )
          : { rows: [] };
      } else {
        const { query, params } = buildBulkFilterQuery(filters, currentAllowedTypes());
        notesResult = await client.query(
          `SELECT q.id, q.thumbnail, q.attachment_full ${query}`,
          params
        );
      }

      if (excludeSet.size > 0) {
        notesResult.rows = notesResult.rows.filter((row) => !excludeSet.has(row.id));
      }

      if (notesResult.rows.length === 0) {
        return rollbackAndJson(client, res, { count: 0, message: "No notes match" });
      }

      const quoteIds = notesResult.rows.map((row) => row.id);
      for (const note of notesResult.rows) {
        if (note.thumbnail) pendingDeletes.push(note.thumbnail);
        if (note.attachment_full) pendingDeletes.push(note.attachment_full);
      }

      const deleteResult = await client.query(
        `DELETE FROM notes WHERE id = ANY($1)`,
        [quoteIds]
      );

      await client.query("COMMIT");
      deletePendingAttachments({
        fileStorage,
        refs: pendingDeletes,
        logger,
        label: "bulk-delete",
      });

      res.json({
        count: deleteResult.rowCount,
        message: `Deleted ${deleteResult.rowCount} notes`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error in bulk delete operation:", error);
      res.status(500).json({ error: "Failed to delete notes" });
    } finally {
      client.release();
    }
  });
}

module.exports = {
  registerQuoteBulkRoutes,
};
