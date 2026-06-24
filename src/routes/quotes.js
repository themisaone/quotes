const {
  buildQuoteCountQuery,
  buildQuoteListQuery,
} = require("../quoteListQuery");
const {
  prepareQuoteCreateAttachments,
  prepareQuoteUpdateAttachments,
  buildPrimaryAttachmentUpdate,
  buildPrimaryAttachmentInsert,
} = require("../quoteAttachmentSync");
const {
  getOrCreateQuoteAuthorId,
  getOrCreateQuoteSourceId,
  resolveEffectiveNoteType,
  buildQuoteInsertParams,
  buildQuoteScalarUpdateFields,
  syncQuoteTags,
  propagateTranslationGroupRename,
} = require("../quoteMetadata");
const {
  rollbackAndStatusJson,
} = require("../transactionResponses");
const {
  enrichNoteResponse,
  enrichSingleNoteResponse,
  enrichNoteListResponse,
} = require("../quoteResponse");

function registerQuoteRoutes(app, {
  pool,
  fileStorage,
  getAllowedTypes,
  getModeName,
  getAttachmentsForNotes,
  applyAttachments,
  retrieveQuoteImages,
  checkTagTablesExist,
  getTagsForNote,
  getTagsForNotes,
  tagHelpers,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");
  if (!fileStorage) throw new Error("fileStorage is required");
  if (!getAllowedTypes) throw new Error("getAllowedTypes is required");
  if (!getAttachmentsForNotes) throw new Error("getAttachmentsForNotes is required");
  if (!applyAttachments) throw new Error("applyAttachments is required");
  if (!retrieveQuoteImages) throw new Error("retrieveQuoteImages is required");
  if (!checkTagTablesExist) throw new Error("checkTagTablesExist is required");
  if (!getTagsForNote) throw new Error("getTagsForNote is required");
  if (!getTagsForNotes) throw new Error("getTagsForNotes is required");

  function currentAllowedTypes() {
    return typeof getAllowedTypes === "function" ? getAllowedTypes() : getAllowedTypes;
  }

  function currentModeName() {
    return typeof getModeName === "function" ? getModeName() : getModeName;
  }

  async function rollbackQuietly(client, label) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logger.error(`${label} rollback failed:`, rollbackError);
    }
  }

  function deleteAttachmentRefs(refs, label) {
    for (const ref of refs) {
      try {
        fileStorage.deleteAttachment(ref);
      } catch (deleteError) {
        logger.error(`${label} attachment cleanup failed:`, deleteError);
      }
    }
  }

  function scheduleOldAttachmentDeletes({
    pendingDeletes,
    existingThumb,
    existingFull,
    finalThumb,
    finalFull,
    thumbnailProvided,
    attachmentFullProvided,
  }) {
    const finalRefs = new Set([finalThumb, finalFull].filter(Boolean));
    if (
      thumbnailProvided &&
      existingThumb &&
      existingThumb !== finalThumb &&
      !finalRefs.has(existingThumb)
    ) {
      pendingDeletes.add(existingThumb);
    }
    if (
      attachmentFullProvided &&
      existingFull &&
      existingFull !== finalFull &&
      !finalRefs.has(existingFull)
    ) {
      pendingDeletes.add(existingFull);
    }
  }

  const enrichmentDependencies = {
    getAttachmentsForNotes,
    checkTagTablesExist,
    getTagsForNote,
    getTagsForNotes,
    retrieveQuoteImages,
    applyAttachments,
  };

  // Get total quote count
  app.get("/api/quotes/count", async (req, res) => {
    try {
      const countQuery = buildQuoteCountQuery(req.query, currentAllowedTypes());
      const filteredResult = await pool.query(countQuery.query, countQuery.params);
      const filteredCount = parseInt(filteredResult.rows[0].count);

      let typeTotal = null;
      if (req.query.note_type) {
        const typeQuery = `SELECT COUNT(*) as count FROM notes WHERE note_type = $1`;
        const typeResult = await pool.query(typeQuery, [req.query.note_type]);
        typeTotal = parseInt(typeResult.rows[0].count);
      }

      const totalResult = await pool.query(`SELECT COUNT(*) as count FROM notes`);
      const grandTotal = parseInt(totalResult.rows[0].count);

      res.json({
        count: filteredCount,
        typeTotal,
        grandTotal,
      });
    } catch (error) {
      logger.error("Error fetching quote count:", error);
      res.status(500).json({ error: "Failed to fetch quote count" });
    }
  });

  // Get available years from training notes.
  app.get("/api/quotes/training-years", async (req, res) => {
    try {
      const query = `
      SELECT DISTINCT t.name as year
      FROM tags t
      JOIN note_tags qt ON t.id = qt.tag_id
      JOIN notes q ON qt.note_id = q.id
      WHERE q.note_type = 'training' 
        AND t.name ~ '^[0-9]{4}$'
      ORDER BY t.name DESC
    `;
      const result = await pool.query(query);
      const years = result.rows.map((row) => parseInt(row.year));
      res.json({ years });
    } catch (error) {
      logger.error("Error fetching training years:", error);
      res.status(500).json({ error: "Failed to fetch training years" });
    }
  });

  // Get all quotes with optional filtering (with author and source details)
  app.get("/api/quotes", async (req, res) => {
    try {
      const listQuery = buildQuoteListQuery(req.query, currentAllowedTypes());
      const result = await pool.query(listQuery.query, listQuery.params);

      if (result.rows.length === 0) {
        return res.json([]);
      }

      res.json(await enrichNoteListResponse(result.rows, enrichmentDependencies));
    } catch (error) {
      logger.error("Error fetching quotes:", error);
      res.status(500).json({ error: "Failed to fetch quotes" });
    }
  });

  // Get random note (must be before /:id route). Default note_type=quote for backward compatibility.
  app.get("/api/quotes/random", async (req, res) => {
    try {
      const raw = req.query.note_type;
      const noteType =
        typeof raw === "string" && raw.trim() !== "" ? raw.trim() : "quote";

      if (!currentAllowedTypes().includes(noteType)) {
        return res.status(403).json({
          error: `Note type "${noteType}" is not available in the current mode (${currentModeName()})`,
        });
      }

      const result = await pool.query(
        `
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.note_type = $1
      ORDER BY RANDOM()
      LIMIT 1
    `,
        [noteType]
      );

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ error: `No notes of type "${noteType}"` });
      }

      const noteId = result.rows[0].id;
      res.json(await enrichSingleNoteResponse(result.rows[0], {
        attachmentNoteId: noteId,
        tagNoteId: noteId,
        ...enrichmentDependencies,
      }));
    } catch (error) {
      logger.error("Error fetching random quote:", error);
      res.status(500).json({ error: "Failed to fetch random quote" });
    }
  });

  // Get single quote by ID
  app.get("/api/quotes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = $1
    `,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Quote not found" });
      }

      const attachmentNoteId = parseInt(id);
      res.json(await enrichSingleNoteResponse(result.rows[0], {
        attachmentNoteId,
        tagNoteId: id,
        ...enrichmentDependencies,
      }));
    } catch (error) {
      logger.error("Error fetching quote:", error);
      res.status(500).json({ error: "Failed to fetch quote" });
    }
  });

  // Get translations for a quote (by translation_group)
  app.get("/api/quotes/:id/translations", async (req, res) => {
    try {
      const { id } = req.params;

      const quoteResult = await pool.query(
        "SELECT translation_group, language FROM notes WHERE id = $1",
        [id]
      );

      if (quoteResult.rows.length === 0) {
        return res.status(404).json({ error: "Quote not found" });
      }

      const { translation_group } = quoteResult.rows[0];

      if (!translation_group) {
        return res.json([]);
      }

      const result = await pool.query(
        `SELECT q.id, q.note_text, q.language, q.type,
              a.name as author_name,
              s.name as source_name
       FROM notes q
       LEFT JOIN authors a ON q.author_id = a.id
       LEFT JOIN sources s ON q.source_id = s.id
       WHERE q.translation_group = $1 AND q.id != $2
       ORDER BY q.language`,
        [translation_group, id]
      );

      return res.json(result.rows);
    } catch (error) {
      logger.error("Error fetching translations:", error);
      return res.status(500).json({ error: "Failed to fetch translations" });
    }
  });

  // Create new quote
  app.post("/api/quotes", async (req, res) => {
    const client = await pool.connect();
    const newAttachmentRefs = new Set();
    let committed = false;

    try {
      await client.query("BEGIN");

      const {
        note_text,
        note_title = null,
        author,
        source,
        sourceType = "BOOK",
        tags = "",
        thumbnail = "",
        attachment_full = "",
        attachment_type = "thumbnail",
        comment = "",
        score = null,
        note_type = "quote",
        note_date = null,
        translation_group = null,
        storageThresholdMB = 1,
      } = req.body;

      if (!note_text && !note_title && !attachment_full && !thumbnail) {
        return rollbackAndStatusJson(
          client,
          res,
          400,
          { error: "Please provide at least some text, a title, or an attachment." }
        );
      }

      const authorId = await getOrCreateQuoteAuthorId(author, client);
      const sourceId = await getOrCreateQuoteSourceId({
        source,
        sourceType,
        client,
        updateTypeOnConflict: true,
      });

      const result = await client.query(
        `INSERT INTO notes (note_text, note_title, author_id, source_id, comment, type, score, note_type, note_date, translation_group) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
        buildQuoteInsertParams({
          noteText: note_text,
          noteTitle: note_title,
          authorId,
          sourceId,
          comment,
          sourceType,
          score,
          noteType: note_type,
          noteDate: note_date,
          translationGroup: translation_group,
        })
      );

      const quoteId = result.rows[0].id;

      const attachmentStorage = prepareQuoteCreateAttachments({
        noteId: quoteId,
        thumbnail,
        attachmentFull: attachment_full,
        attachmentType: attachment_type,
        noteType: note_type,
        storageThresholdMB,
        fileStorage,
        onStoredFile: (ref) => newAttachmentRefs.add(ref),
      });

      await client.query(
        `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
        attachmentStorage.updateParams
      );

      if (attachmentStorage.shouldInsertPrimaryAttachment) {
        await client.query(
          `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type)
         VALUES ($1, 0, $2, $3, $4, 'base64')
         ON CONFLICT DO NOTHING`,
          attachmentStorage.insertParams
        );
      }

      await syncQuoteTags({
        noteId: quoteId,
        tags,
        noteType: note_type,
        client,
        helpers: tagHelpers,
      });

      await client.query("COMMIT");
      committed = true;

      const completeQuote = await pool.query(
        `SELECT q.*, a.name as author_name, a.image as author_image,
              s.name as source_name, s.image as source_image, q.type as source_type
       FROM notes q
       LEFT JOIN authors a ON q.author_id = a.id
       LEFT JOIN sources s ON q.source_id = s.id
       WHERE q.id = $1`,
        [quoteId]
      );

      const quoteTags = await getTagsForNote(quoteId);
      const attachmentsMap = await getAttachmentsForNotes([quoteId]);
      res.status(201).json(enrichNoteResponse(completeQuote.rows[0], {
        attachments: attachmentsMap.get(quoteId),
        tags: quoteTags,
        tagsFallback: "",
        retrieveQuoteImages,
        applyAttachments,
      }));
    } catch (error) {
      if (!committed) {
        await rollbackQuietly(client, "quote-create");
        deleteAttachmentRefs(newAttachmentRefs, "quote-create rollback");
      }
      logger.error("Error creating quote:", error);
      res.status(500).json({ error: "Failed to create quote" });
    } finally {
      client.release();
    }
  });

  // Update quote
  app.put("/api/quotes/:id", async (req, res) => {
    const client = await pool.connect();
    const newAttachmentRefs = new Set();
    const pendingOldAttachmentDeletes = new Set();
    let committed = false;

    try {
      await client.query("BEGIN");

      const { id } = req.params;
      const {
        note_text,
        note_title,
        author,
        source,
        sourceType,
        tags,
        thumbnail,
        attachment_full,
        attachment_type,
        comment,
        score,
        note_type,
        note_date,
        translation_group,
        storageThresholdMB = 1,
      } = req.body;

      const authorId = author !== undefined
        ? await getOrCreateQuoteAuthorId(author, client)
        : null;
      const newSourceId = source !== undefined
        ? await getOrCreateQuoteSourceId({
          source,
          sourceType: sourceType || "BOOK",
          client,
          updateTypeOnConflict: false,
        })
        : null;

      const existingRow = await client.query(
        `SELECT thumbnail, attachment_full, note_type FROM notes WHERE id = $1`,
        [id]
      );
      const existingThumb = existingRow.rows[0]?.thumbnail || null;
      const existingFull = existingRow.rows[0]?.attachment_full || null;
      const effectiveNoteType = resolveEffectiveNoteType({
        requestedNoteType: note_type,
        existingNoteType: existingRow.rows[0]?.note_type,
      });

      const updateFields = [];
      const params = [];
      let paramCounter = 1;

      if (translation_group !== undefined) {
        await propagateTranslationGroupRename({
          noteId: id,
          translationGroup: translation_group,
          client,
        });
      }

      const scalarFields = buildQuoteScalarUpdateFields({
        noteText: note_text,
        noteTitle: note_title,
        authorProvided: author !== undefined,
        authorId,
        sourceProvided: source !== undefined,
        sourceId: newSourceId,
        comment,
        score,
        sourceType,
        attachmentType: attachment_type,
        noteType: note_type,
        noteDate: note_date,
        translationGroup: translation_group,
      });
      for (const field of scalarFields) {
        updateFields.push(`${field.column} = $${paramCounter}`);
        params.push(field.value);
        paramCounter++;
      }

      const attachmentStorage = prepareQuoteUpdateAttachments({
        noteId: id,
        thumbnail,
        attachmentFull: attachment_full,
        noteType: effectiveNoteType,
        storageThresholdMB,
        fileStorage,
        onStoredFile: (ref) => newAttachmentRefs.add(ref),
      });
      for (const field of attachmentStorage.fields) {
        updateFields.push(`${field.column} = $${paramCounter}`);
        params.push(field.value);
        paramCounter++;
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      if (updateFields.length === 0) {
        return rollbackAndStatusJson(client, res, 400, { error: "No fields to update" });
      }

      params.push(id);
      const result = await client.query(
        `UPDATE notes SET ${updateFields.join(", ")} WHERE id = $${paramCounter} RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        const response = await rollbackAndStatusJson(client, res, 404, { error: "Quote not found" });
        deleteAttachmentRefs(newAttachmentRefs, "quote-update not-found rollback");
        return response;
      }

      const finalThumb = thumbnail !== undefined
        ? attachmentStorage.processedThumbnail
        : existingThumb;
      const finalFull = attachment_full !== undefined
        ? attachmentStorage.processedAttachmentFull
        : existingFull;
      scheduleOldAttachmentDeletes({
        pendingDeletes: pendingOldAttachmentDeletes,
        existingThumb,
        existingFull,
        finalThumb,
        finalFull,
        thumbnailProvided: thumbnail !== undefined,
        attachmentFullProvided: attachment_full !== undefined,
      });

      if (tags !== undefined) {
        await syncQuoteTags({
          noteId: id,
          tags,
          noteType: effectiveNoteType,
          client,
          clearWhenEmpty: true,
          helpers: tagHelpers,
        });
      }

      if (thumbnail !== undefined || attachment_full !== undefined || attachment_type !== undefined) {
        const syncThumb = attachmentStorage.processedThumbnail;
        const syncFull = attachmentStorage.processedAttachmentFull;

        const existing = await client.query(
          `SELECT id FROM note_attachments WHERE note_id = $1 AND position = 0`,
          [id]
        );
        if (existing.rows.length > 0) {
          const syncQuery = buildPrimaryAttachmentUpdate({
            noteId: id,
            thumbnail: syncThumb,
            attachmentFull: syncFull,
            attachmentType: attachment_type,
          });
          if (syncQuery) {
            await client.query(syncQuery.sql, syncQuery.params);
          }
        } else {
          const insertQuery = buildPrimaryAttachmentInsert({
            noteId: id,
            thumbnail: syncThumb,
            attachmentFull: syncFull,
            attachmentType: attachment_type,
          });
          if (insertQuery) {
            await client.query(insertQuery.sql, insertQuery.params);
          }
        }
      }

      await client.query("COMMIT");
      committed = true;
      deleteAttachmentRefs(pendingOldAttachmentDeletes, "quote-update post-commit");

      const completeQuote = await pool.query(
        `SELECT q.*, a.name as author_name, a.image as author_image,
              s.name as source_name, s.image as source_image, q.type as source_type
       FROM notes q
       LEFT JOIN authors a ON q.author_id = a.id
       LEFT JOIN sources s ON q.source_id = s.id
       WHERE q.id = $1`,
        [id]
      );

      const hasNewTables = await checkTagTablesExist();
      const quoteTags = hasNewTables ? await getTagsForNote(id) : [];
      const attachmentsMap = await getAttachmentsForNotes([parseInt(id)]);
      res.json(enrichNoteResponse(completeQuote.rows[0], {
        attachments: attachmentsMap.get(parseInt(id)),
        tags: quoteTags,
        tagsFallback: completeQuote.rows[0].tags || "",
        retrieveQuoteImages,
        applyAttachments,
      }));
    } catch (error) {
      if (!committed) {
        await rollbackQuietly(client, "quote-update");
        deleteAttachmentRefs(newAttachmentRefs, "quote-update rollback");
      }
      logger.error("Error updating quote:", error);
      res.status(500).json({ error: "Failed to update quote" });
    } finally {
      client.release();
    }
  });

  // Delete quote
  app.delete("/api/quotes/:id", async (req, res) => {
    const client = await pool.connect();
    const pendingAttachmentDeletes = new Set();
    let committed = false;

    try {
      await client.query("BEGIN");
      const { id } = req.params;

      const noteResult = await client.query(
        "SELECT thumbnail, attachment_full FROM notes WHERE id = $1",
        [id]
      );

      if (noteResult.rows.length === 0) {
        return rollbackAndStatusJson(client, res, 404, { error: "Quote not found" });
      }

      const attachmentRows = await client.query(
        `SELECT thumbnail, attachment_full
         FROM note_attachments
         WHERE note_id = $1`,
        [id]
      );

      const note = noteResult.rows[0];
      if (note.thumbnail) pendingAttachmentDeletes.add(note.thumbnail);
      if (note.attachment_full) pendingAttachmentDeletes.add(note.attachment_full);
      for (const attachment of attachmentRows.rows) {
        if (attachment.thumbnail) pendingAttachmentDeletes.add(attachment.thumbnail);
        if (attachment.attachment_full) pendingAttachmentDeletes.add(attachment.attachment_full);
      }

      const result = await client.query(
        "DELETE FROM notes WHERE id = $1 RETURNING *",
        [id]
      );

      if (result.rows.length === 0) {
        return rollbackAndStatusJson(client, res, 404, { error: "Quote not found" });
      }

      await client.query("COMMIT");
      committed = true;
      deleteAttachmentRefs(pendingAttachmentDeletes, "quote-delete post-commit");

      return res.json({ message: "Quote deleted successfully", quote: result.rows[0] });
    } catch (error) {
      if (!committed) {
        await rollbackQuietly(client, "quote-delete");
      }
      logger.error("Error deleting quote:", error);
      return res.status(500).json({ error: "Failed to delete quote" });
    } finally {
      client.release();
    }
  });

  // POST /api/notes/merge
  // Body: { mainNoteId, otherNoteIds[], appendTexts, mergeTags }
  app.post("/api/notes/merge", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { mainNoteId, otherNoteIds = [], appendTexts = true, mergeTags = true } = req.body;
      if (!mainNoteId || !Array.isArray(otherNoteIds) || otherNoteIds.length === 0) {
        return rollbackAndStatusJson(
          client,
          res,
          400,
          { error: "mainNoteId and otherNoteIds required" }
        );
      }
      if (otherNoteIds.some((noteId) => String(noteId) === String(mainNoteId))) {
        return rollbackAndStatusJson(
          client,
          res,
          400,
          { error: "Cannot merge a note into itself" }
        );
      }

      const mainRow = await client.query(
        `SELECT * FROM notes WHERE id = $1`,
        [mainNoteId]
      );
      if (mainRow.rows.length === 0) {
        return rollbackAndStatusJson(client, res, 404, { error: "Main note not found" });
      }

      let nextPos = (await client.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM note_attachments WHERE note_id = $1`,
        [mainNoteId]
      )).rows[0].n;

      for (const otherId of otherNoteIds) {
        const otherAtts = await client.query(
          `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
          [otherId]
        );
        for (const att of otherAtts.rows) {
          await client.query(
            `UPDATE note_attachments SET note_id = $1, position = $2 WHERE id = $3`,
            [mainNoteId, nextPos++, att.id]
          );
        }
      }

      if (appendTexts) {
        const others = await client.query(
          `SELECT id, note_text, comment FROM notes WHERE id = ANY($1::int[]) ORDER BY id`,
          [otherNoteIds]
        );
        const dividerParts = others.rows
          .filter((row) => row.note_text && row.note_text.trim() !== "")
          .map((row) => {
            const label = row.comment ? `<em>${row.comment}</em>` : "";
            return `<hr>${label}${row.note_text}`;
          });
        if (dividerParts.length > 0) {
          const appendedText = (mainRow.rows[0].note_text || "") + dividerParts.join("");
          await client.query(
            `UPDATE notes SET note_text = $1 WHERE id = $2`,
            [appendedText, mainNoteId]
          );
        }
      }

      if (mergeTags) {
        const otherTagIds = await client.query(
          `SELECT DISTINCT tag_id FROM note_tags WHERE note_id = ANY($1::int[])`,
          [otherNoteIds]
        );
        for (const row of otherTagIds.rows) {
          await client.query(
            `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [mainNoteId, row.tag_id]
          );
        }
      }

      await client.query(
        `DELETE FROM notes WHERE id = ANY($1::int[])`,
        [otherNoteIds]
      );

      await client.query(
        `UPDATE notes SET translation_group = NULL WHERE id = $1`,
        [mainNoteId]
      );

      const newFirst = await client.query(
        `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position LIMIT 1`,
        [mainNoteId]
      );
      if (newFirst.rows.length > 0) {
        const first = newFirst.rows[0];
        await client.query(
          `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
          [first.thumbnail, first.attachment_full, first.attachment_type, mainNoteId]
        );
      }

      await client.query("COMMIT");

      const result = await pool.query(
        `SELECT q.*, a.name as author_name, a.image as author_image,
              s.name as source_name, s.image as source_image, q.type as source_type
       FROM notes q
       LEFT JOIN authors a ON q.author_id = a.id
       LEFT JOIN sources s ON q.source_id = s.id
       WHERE q.id = $1`,
        [mainNoteId]
      );
      const quoteTags = await getTagsForNote(mainNoteId);
      const attachmentsMap = await getAttachmentsForNotes([mainNoteId]);
      res.json(enrichNoteResponse(result.rows[0], {
        attachments: attachmentsMap.get(mainNoteId),
        tags: quoteTags,
        tagsFallback: quoteTags.map((tag) => tag.name).join(", "),
        retrieveQuoteImages,
        applyAttachments,
      }));
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Merge error:", error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  });
}

module.exports = {
  registerQuoteRoutes,
};
