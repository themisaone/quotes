const fs = require("fs");
const os = require("os");
const path = require("path");

function getDbAttachmentOutputDir({ pathImpl = path, osImpl = os } = {}) {
  return pathImpl.join(osImpl.homedir(), "Downloads", "DB-attachments");
}

function getExtensionForMime(mimeType, mimeToExt = {}) {
  return mimeToExt[mimeType]
    || mimeType.split("/")[1]?.split(";")[0]?.trim()
    || "bin";
}

function buildDbAttachmentExportTarget(row, outBase, { pathImpl = path, mimeToExt = {} } = {}) {
  const raw = row.attachment_full;
  if (!raw || !raw.startsWith("data:")) return null;

  const mimeMatch = raw.match(/^data:([^;]+);base64,/);
  if (!mimeMatch) return null;

  const mimeType = mimeMatch[1];
  const ext = getExtensionForMime(mimeType, mimeToExt);
  const suffix = row.position >= 0 ? `_${row.position}` : "";
  const filename = `${row.note_id}${suffix}.${ext}`;
  const noteType = row.note_type || "notes";

  return {
    noteId: row.note_id,
    noteType,
    filename,
    outDir: pathImpl.join(outBase, noteType),
    outFile: pathImpl.join(outBase, noteType, filename),
    relativeFile: pathImpl.join(noteType, filename),
    base64Data: raw.split(",")[1],
  };
}

async function fetchDbAttachmentRows(pool) {
  const multiRows = await pool.query(`
      SELECT na.id, na.note_id, na.position, na.attachment_full, na.thumbnail,
             na.attachment_type, n.note_type
      FROM note_attachments na
      JOIN notes n ON n.id = na.note_id
      WHERE na.attachment_full IS NOT NULL
        AND na.attachment_full NOT LIKE 'file:%'
        AND LENGTH(na.attachment_full) > 100
      ORDER BY na.note_id, na.position
    `);

  const flatRows = await pool.query(`
      SELECT n.id AS note_id, -1 AS position, n.attachment_full,
             n.thumbnail, n.attachment_type, n.note_type
      FROM notes n
      WHERE n.attachment_full IS NOT NULL
        AND n.attachment_full NOT LIKE 'file:%'
        AND LENGTH(n.attachment_full) > 100
        AND NOT EXISTS (
          SELECT 1 FROM note_attachments na
          WHERE na.note_id = n.id AND na.attachment_full = n.attachment_full
        )
    `);

  return [...multiRows.rows, ...flatRows.rows];
}

async function exportDbAttachmentRows({
  rows,
  outBase,
  fileStorage,
  fsImpl = fs,
  pathImpl = path,
  logger = console,
}) {
  const results = [];
  let exported = 0;
  let skipped = 0;
  const mimeToExt = fileStorage.MIME_TO_EXT || {};

  for (const row of rows) {
    const target = buildDbAttachmentExportTarget(row, outBase, { pathImpl, mimeToExt });
    if (!target) {
      skipped++;
      continue;
    }

    if (fsImpl.existsSync(target.outFile)) {
      skipped++;
      continue;
    }

    try {
      fsImpl.mkdirSync(target.outDir, { recursive: true });
      fsImpl.writeFileSync(target.outFile, Buffer.from(target.base64Data, "base64"));
      exported++;
      results.push({ noteId: target.noteId, file: target.relativeFile });
    } catch (writeErr) {
      logger.error(`Failed to write ${target.outFile}:`, writeErr.message);
      skipped++;
    }
  }

  return { exported, skipped, files: results };
}

function registerDbAttachmentExportRoutes(app, {
  pool,
  fileStorage,
  fsImpl = fs,
  pathImpl = path,
  osImpl = os,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");
  if (!fileStorage) throw new Error("fileStorage is required");

  app.post("/api/export/db-attachments", async (req, res) => {
    const outBase = getDbAttachmentOutputDir({ pathImpl, osImpl });

    try {
      const rows = await fetchDbAttachmentRows(pool);
      const { exported, skipped, files } = await exportDbAttachmentRows({
        rows,
        outBase,
        fileStorage,
        fsImpl,
        pathImpl,
        logger,
      });

      res.json({
        ok: true,
        exported,
        skipped,
        outputDir: outBase,
        files,
      });
    } catch (err) {
      logger.error("Export DB attachments error:", err);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = {
  buildDbAttachmentExportTarget,
  exportDbAttachmentRows,
  fetchDbAttachmentRows,
  getDbAttachmentOutputDir,
  getExtensionForMime,
  registerDbAttachmentExportRoutes,
};
