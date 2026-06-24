const fs = require("fs");
const path = require("path");
const { normalizeAttachmentFolder } = require("../attachmentFolders");

function resolveAttachment(att, { fileStorage }) {
  if (!att) return att;
  return {
    ...att,
    thumbnail: att.thumbnail ? fileStorage.retrieveFromStorage(att.thumbnail) : null,
    // attachment_full is kept as-is (file: ref or base64), matching note rows.
  };
}

function applyAttachments(note, attachments) {
  const list = attachments || [];
  const first = list[0] || null;
  return {
    ...note,
    attachments: list,
    thumbnail: first ? first.thumbnail : note.thumbnail,
    attachment_full: first ? first.attachment_full : note.attachment_full,
    attachment_type: first ? first.attachment_type : note.attachment_type,
  };
}

function createAttachmentHelpers({ pool, fileStorage }) {
  if (!pool) throw new Error("pool is required");
  if (!fileStorage) throw new Error("fileStorage is required");

  return {
    resolveAttachment: (att) => resolveAttachment(att, { fileStorage }),
    applyAttachments,
    async getAttachmentsForNotes(noteIds) {
      if (!noteIds || noteIds.length === 0) return new Map();
      try {
        const result = await pool.query(
          `SELECT * FROM note_attachments
       WHERE note_id = ANY($1::int[])
       ORDER BY note_id, position`,
          [noteIds]
        );
        const map = new Map();
        for (const row of result.rows) {
          if (!map.has(row.note_id)) map.set(row.note_id, []);
          map.get(row.note_id).push(resolveAttachment(row, { fileStorage }));
        }
        return map;
      } catch (_) {
        // The table may not exist yet during startup migration.
        return new Map();
      }
    },
  };
}

function normalizeStorageFolder(folder, fallback = "note") {
  return normalizeAttachmentFolder(folder, fallback);
}

function sanitizeOriginalFilename(filename, fallback = "attachment") {
  const normalized = String(filename || fallback).replace(/\\/g, "/");
  const basename = path.basename(normalized).trim();
  return basename || fallback;
}

function isSafeAttachmentRelativePath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") return false;
  if (relativePath.includes("\\")) return false;
  if (path.posix.isAbsolute(relativePath)) return false;
  return !relativePath.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

async function rollbackQuietly(client) {
  if (!client) return;
  await client.query("ROLLBACK").catch(() => {});
}

function isFileReference(value) {
  return typeof value === "string" && value.startsWith("file:");
}

function trackNewFileRef(refs, ref, originalValue = null) {
  if (isFileReference(ref) && ref !== originalValue) refs.add(ref);
}

function deleteAttachmentRefs(refs, { fileStorage, logger, label }) {
  for (const ref of refs) {
    try {
      fileStorage.deleteAttachment(ref);
    } catch (error) {
      logger.error(`${label} attachment cleanup failed:`, error);
    }
  }
}

function registerAttachmentRoutes(app, {
  pool,
  fileStorage,
  upload,
  fsImpl = fs,
  pathImpl = path,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");
  if (!fileStorage) throw new Error("fileStorage is required");
  if (!upload) throw new Error("upload middleware is required");

  const helpers = createAttachmentHelpers({ pool, fileStorage });

  // POST /api/quotes/:id/downscale-thumbnail
  // Overwrites an existing full-size file with a smaller body and keeps DB refs unchanged.
  app.post("/api/quotes/:id/downscale-thumbnail", async (req, res) => {
    try {
      const { id } = req.params;
      const { thumbnail, attachment_full, oldFilePath } = req.body;

      if (oldFilePath) {
        if (!isSafeAttachmentRelativePath(oldFilePath)) {
          return res.status(400).json({ error: "Invalid attachment path" });
        }

        const { data } = fileStorage.parseBase64Data(attachment_full);
        const buffer = Buffer.from(data, "base64");
        const fullPath = pathImpl.join(fileStorage.getAttachmentsDir(), oldFilePath);
        fsImpl.mkdirSync(pathImpl.dirname(fullPath), { recursive: true });
        fsImpl.writeFileSync(fullPath, buffer);
      }

      await pool.query(
        `UPDATE notes SET thumbnail = $1 WHERE id = $2`,
        [thumbnail, id]
      );

      await pool.query(
        `UPDATE note_attachments SET thumbnail = $1
         WHERE note_id = $2 AND (attachment_full LIKE $3 OR thumbnail LIKE $3)`,
        [thumbnail, id, `file:${oldFilePath}%`]
      );

      res.json({ success: true });
    } catch (error) {
      logger.error("Error downscaling thumbnail:", error);
      res.status(500).json({ error: "Failed to downscale thumbnail" });
    }
  });

  // GET /api/notes/:id/attachments - list all attachments for a note
  app.get("/api/notes/:id/attachments", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
        [id]
      );
      res.json(result.rows.map(helpers.resolveAttachment));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/notes/:id/attachments - add an attachment to a note
  app.post("/api/notes/:id/attachments", async (req, res) => {
    const client = await pool.connect();
    const newAttachmentRefs = new Set();
    let committed = false;

    try {
      await client.query("BEGIN");
      const { id } = req.params;
      const {
        thumbnail,
        attachment_full,
        attachment_type = "image",
        filename,
        storageThresholdMB = 1,
      } = req.body;

      const noteRow = await client.query(`SELECT note_type FROM notes WHERE id = $1`, [id]);
      if (noteRow.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Note not found" });
      }
      const folder = noteRow.rows[0].note_type || "historical";

      const posResult = await client.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM note_attachments WHERE note_id = $1`,
        [id]
      );
      const position = posResult.rows[0].next_pos;

      const storageId = `${id}_a${position}`;
      const renamedThumb = fileStorage.finalizeUploadedFile(thumbnail, storageId, "");
      trackNewFileRef(newAttachmentRefs, renamedThumb, thumbnail);
      const renamedFull = fileStorage.finalizeUploadedFile(attachment_full, storageId, "");
      trackNewFileRef(newAttachmentRefs, renamedFull, attachment_full);
      const processedThumb = fileStorage.processForStorage(
        renamedThumb,
        folder,
        storageId,
        "",
        storageThresholdMB,
        false
      );
      trackNewFileRef(newAttachmentRefs, processedThumb, renamedThumb);
      const processedFull = fileStorage.processForStorage(
        renamedFull,
        folder,
        storageId,
        "",
        storageThresholdMB,
        true
      );
      trackNewFileRef(newAttachmentRefs, processedFull, renamedFull);

      const ins = await client.query(
        `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
       VALUES ($1, $2, $3, $4, $5, 'base64', $6) RETURNING *`,
        [id, position, processedThumb, processedFull, attachment_type, filename || null]
      );

      if (position === 0) {
        await client.query(
          `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
          [processedThumb, processedFull, attachment_type, id]
        );
      }

      await client.query("COMMIT");
      committed = true;
      res.status(201).json(helpers.resolveAttachment(ins.rows[0]));
    } catch (err) {
      if (!committed) {
        await rollbackQuietly(client);
        deleteAttachmentRefs(newAttachmentRefs, {
          fileStorage,
          logger,
          label: "attachment-create rollback",
        });
      }
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE /api/notes/:noteId/attachments/:attachId - remove one attachment
  app.delete("/api/notes/:noteId/attachments/:attachId", async (req, res) => {
    const client = await pool.connect();
    const pendingAttachmentDeletes = new Set();
    let committed = false;

    try {
      await client.query("BEGIN");
      const { noteId, attachId } = req.params;

      const attRow = await client.query(
        `SELECT * FROM note_attachments WHERE id = $1 AND note_id = $2`,
        [attachId, noteId]
      );
      if (attRow.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Attachment not found" });
      }

      const att = attRow.rows[0];
      if (att.thumbnail) pendingAttachmentDeletes.add(att.thumbnail);
      if (att.attachment_full) pendingAttachmentDeletes.add(att.attachment_full);

      await client.query(`DELETE FROM note_attachments WHERE id = $1`, [attachId]);

      await client.query(
        `UPDATE note_attachments SET position = pos_rank - 1
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS pos_rank
             FROM note_attachments WHERE note_id = $1) ranked
       WHERE note_attachments.id = ranked.id`,
        [noteId]
      );

      const newFirst = await client.query(
        `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position LIMIT 1`,
        [noteId]
      );
      if (newFirst.rows.length > 0) {
        const first = newFirst.rows[0];
        await client.query(
          `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
          [first.thumbnail, first.attachment_full, first.attachment_type, noteId]
        );
      } else {
        await client.query(
          `UPDATE notes SET thumbnail = NULL, attachment_full = NULL, attachment_type = NULL WHERE id = $1`,
          [noteId]
        );
      }

      await client.query("COMMIT");
      committed = true;
      deleteAttachmentRefs(pendingAttachmentDeletes, {
        fileStorage,
        logger,
        label: "attachment-delete post-commit",
      });
      res.json({ ok: true });
    } catch (err) {
      if (!committed) await rollbackQuietly(client);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // POST /api/notes/:id/attachments/file
  app.post("/api/notes/:id/attachments/file", upload.single("file"), async (req, res) => {
    let client;
    let tmpPath;
    let stablePath;
    let committed = false;

    try {
      const noteId = req.params.id;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      tmpPath = req.file.path;
      const folder = normalizeStorageFolder(req.body?.folder, "note");
      const origName = sanitizeOriginalFilename(req.body?.original_name || req.file.originalname);
      const attachType = req.body?.attachment_type || "encrypted";

      const stableFilename = `${noteId}.${origName}.enc`;
      const stableDir = pathImpl.join(fileStorage.getAttachmentsDir(), folder);
      if (!fsImpl.existsSync(stableDir)) fsImpl.mkdirSync(stableDir, { recursive: true });
      stablePath = pathImpl.join(stableDir, stableFilename);
      fsImpl.renameSync(tmpPath, stablePath);

      const relPath = `${folder}/${stableFilename}`;
      const fileRef = `file:${relPath}`;

      client = await pool.connect();
      await client.query("BEGIN");

      const posRes = await client.query(
        `SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM note_attachments WHERE note_id = $1`,
        [noteId]
      );
      const position = posRes.rows[0].pos;

      await client.query(
        `INSERT INTO note_attachments (note_id, thumbnail, attachment_full, attachment_type, position)
       VALUES ($1, $2, $3, $4, $5)`,
        [noteId, null, fileRef, attachType, position]
      );

      if (position === 0) {
        await client.query(
          `UPDATE notes SET thumbnail = NULL, attachment_full = $1, attachment_type = $2 WHERE id = $3`,
          [fileRef, attachType, noteId]
        );
      }

      await client.query("COMMIT");
      committed = true;

      res.json({ ok: true, fileRef, relPath });
    } catch (err) {
      await rollbackQuietly(client);
      if (stablePath && !committed && fsImpl.existsSync(stablePath)) {
        fsImpl.unlinkSync(stablePath);
      }
      if (!stablePath && tmpPath && fsImpl.existsSync(tmpPath)) {
        fsImpl.unlinkSync(tmpPath);
      }
      if (err.status) return res.status(err.status).json({ error: err.message });
      logger.error("Encrypted upload error:", err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  // PATCH /api/notes/:noteId/attachments/:attachId/make-primary
  app.patch("/api/notes/:noteId/attachments/:attachId/make-primary", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { noteId, attachId } = req.params;

      const allRows = await client.query(
        `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
        [noteId]
      );
      if (allRows.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "No attachments" });
      }

      const targetIdx = allRows.rows.findIndex((row) => row.id === parseInt(attachId, 10));
      if (targetIdx < 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Attachment not found" });
      }
      if (targetIdx === 0) {
        await client.query("ROLLBACK");
        return res.json({ ok: true });
      }

      const reordered = [
        allRows.rows[targetIdx],
        ...allRows.rows.slice(0, targetIdx),
        ...allRows.rows.slice(targetIdx + 1),
      ];
      for (let i = 0; i < reordered.length; i++) {
        await client.query(
          `UPDATE note_attachments SET position = $1 WHERE id = $2`,
          [i, reordered[i].id]
        );
      }

      const first = reordered[0];
      await client.query(
        `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
        [first.thumbnail, first.attachment_full, first.attachment_type, noteId]
      );

      await client.query("COMMIT");

      const updated = await pool.query(
        `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
        [noteId]
      );
      res.json(updated.rows.map(helpers.resolveAttachment));
    } catch (err) {
      await rollbackQuietly(client);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });
}

module.exports = {
  applyAttachments,
  createAttachmentHelpers,
  isSafeAttachmentRelativePath,
  normalizeStorageFolder,
  registerAttachmentRoutes,
  resolveAttachment,
  sanitizeOriginalFilename,
};
