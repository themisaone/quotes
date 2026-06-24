const archiver = require("archiver");
const fs = require("fs");
const path = require("path");
const {
  createAttachmentExportResolver,
  endExportResponse,
  syncNotesIdSequence,
  toPgDateOnlyString,
  writeExportChunk,
} = require("../exportImportHelpers");

function readExportEmbedThresholdMB({ fsImpl, getSettingsFile }) {
  try {
    const settingsRaw = fsImpl.readFileSync(getSettingsFile(), "utf8");
    const settings = JSON.parse(settingsRaw);
    const rawThreshold = settings?.externalStorageThreshold;
    if (rawThreshold != null && rawThreshold !== "") {
      const parsed = Number(rawThreshold);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch (_) {
    // Use default when settings are absent or unreadable.
  }
  return 1;
}

function buildBigFilesReport(bigFiles) {
  const ts = new Date().toISOString();
  const lines = [
    `NoteArchive Export — ${ts}`,
    "Large attachments NOT embedded in JSON (kept as file references; see embed threshold in Settings):",
    "These files must be present in your vault to be usable after import.",
    "",
  ];

  let totalMB = 0;
  for (const file of bigFiles) {
    lines.push(`Note ${String(file.noteId).padEnd(6)}  ${file.path.padEnd(50)}  ${file.sizeMB} MB`);
    totalMB += parseFloat(file.sizeMB);
  }
  lines.push("");
  lines.push(`Total: ${bigFiles.length} file(s), ${totalMB.toFixed(1)} MB`);

  return {
    date: ts.split("T")[0],
    text: lines.join("\n"),
  };
}

function registerExportImportRoutes(app, {
  pool,
  fileStorage,
  getSettingsFile,
  fsImpl = fs,
  pathImpl = path,
  archiverImpl = archiver,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");
  if (!fileStorage) throw new Error("fileStorage is required");
  if (!getSettingsFile) throw new Error("getSettingsFile is required");

  let lastExportBigFiles = [];
  const lastExportBigFilePaths = new Set();
  const resolveAttachmentForExport = createAttachmentExportResolver({
    fileStorage,
    fsImpl,
    pathImpl,
    seenBigFilePaths: lastExportBigFilePaths,
  });

  app.get("/api/export/json", async (req, res) => {
    const { note_type } = req.query;

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=quotes_backup_${new Date().toISOString().split("T")[0]}.json`,
    );

    try {
      req.on("close", () => {
        if (!res.writableEnded) {
          logger.warn("[export/json] client closed connection before export finished");
        }
      });
      res.on("error", (err) => {
        logger.error("[export/json] response stream error:", err?.message || err);
      });

      lastExportBigFiles = [];
      lastExportBigFilePaths.clear();

      const exportEmbedThresholdMB = readExportEmbedThresholdMB({ fsImpl, getSettingsFile });

      logger.log("[export/json] start", {
        note_type: note_type || "all",
        exportEmbedThresholdMB,
      });

      const authorsResult = await pool.query("SELECT * FROM authors ORDER BY id");
      const sourcesResult = await pool.query("SELECT * FROM sources ORDER BY id");
      const tagsResult = await pool.query("SELECT * FROM tags    ORDER BY id");

      const countParams = note_type ? [note_type] : [];
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM notes${note_type ? " WHERE note_type = $1" : ""}`,
        countParams,
      );
      const quoteCount = parseInt(countResult.rows[0].count, 10);

      const counts = {
        authors: authorsResult.rows.length,
        sources: sourcesResult.rows.length,
        tags: tagsResult.rows.length,
        quotes: quoteCount,
      };

      await writeExportChunk(res, '{"version":"2.0"');
      await writeExportChunk(res, `,"exportedAt":${JSON.stringify(new Date().toISOString())}`);
      await writeExportChunk(res, `,"noteTypeFilter":${JSON.stringify(note_type || "all")}`);
      await writeExportChunk(res, `,"counts":${JSON.stringify(counts)}`);
      await writeExportChunk(res, `,"data":{"authors":${JSON.stringify(authorsResult.rows)}`);
      await writeExportChunk(res, `,"sources":${JSON.stringify(sourcesResult.rows)}`);
      await writeExportChunk(res, `,"tags":${JSON.stringify(tagsResult.rows)}`);
      await writeExportChunk(res, ',"quotes":[');

      const batchSize = 200;
      let lastId = 0;
      let first = true;
      const noteTypeClause = note_type ? "AND q.note_type = $3" : "";

      while (true) {
        const params = note_type ? [lastId, batchSize, note_type] : [lastId, batchSize];
        const batch = await pool.query(
          `SELECT q.*,
                  a.name AS author_name,
                  s.name AS source_name,
                  COALESCE(
                    json_agg(json_build_object('id', t.id, 'name', t.name, 'type', t.type))
                    FILTER (WHERE t.id IS NOT NULL),
                    '[]'::json
                  ) AS tag_objects
           FROM notes q
           LEFT JOIN authors   a  ON a.id = q.author_id
           LEFT JOIN sources   s  ON s.id = q.source_id
           LEFT JOIN note_tags nt ON nt.note_id = q.id
           LEFT JOIN tags      t  ON t.id = nt.tag_id
           WHERE q.id > $1 ${noteTypeClause}
           GROUP BY q.id, a.name, s.name
           ORDER BY q.id
           LIMIT $2`,
          params,
        );

        if (batch.rows.length === 0) break;

        const noteIds = batch.rows.map((row) => row.id);
        const attachmentsByNote = new Map();
        if (noteIds.length > 0) {
          const attachmentsResult = await pool.query(
            `SELECT note_id, position, thumbnail, attachment_full, attachment_type, filename
             FROM note_attachments
             WHERE note_id = ANY($1::int[])
             ORDER BY note_id, position`,
            [noteIds],
          );
          for (const attachment of attachmentsResult.rows) {
            if (!attachmentsByNote.has(attachment.note_id)) {
              attachmentsByNote.set(attachment.note_id, []);
            }
            attachmentsByNote.get(attachment.note_id).push(attachment);
          }
        }

        for (const note of batch.rows) {
          const attachmentRows = attachmentsByNote.get(note.id);
          if (attachmentRows && attachmentRows.length > 0) {
            note.attachments = attachmentRows.map((attachment) => ({
              position: attachment.position,
              thumbnail: resolveAttachmentForExport(
                attachment.thumbnail,
                note.id,
                lastExportBigFiles,
                exportEmbedThresholdMB,
              ),
              attachment_full: resolveAttachmentForExport(
                attachment.attachment_full,
                note.id,
                lastExportBigFiles,
                exportEmbedThresholdMB,
              ),
              attachment_type: attachment.attachment_type,
              filename: attachment.filename,
            }));
            const primaryRow = attachmentRows.find((row) => row.position === 0) || attachmentRows[0];
            if (primaryRow.attachment_type) note.attachment_type = primaryRow.attachment_type;
            delete note.thumbnail;
            delete note.attachment_full;
          } else {
            note.attachment_full = resolveAttachmentForExport(
              note.attachment_full,
              note.id,
              lastExportBigFiles,
              exportEmbedThresholdMB,
            );
            note.thumbnail = resolveAttachmentForExport(
              note.thumbnail,
              note.id,
              lastExportBigFiles,
              exportEmbedThresholdMB,
            );
          }

          if (!first) await writeExportChunk(res, ",");
          note.note_date = toPgDateOnlyString(note.note_date);
          await writeExportChunk(res, JSON.stringify(note));
          first = false;
        }

        lastId = batch.rows[batch.rows.length - 1].id;
        if (batch.rows.length < batchSize) break;
      }

      await writeExportChunk(
        res,
        `],"_bigFilesCount":${lastExportBigFiles.length}}}`,
      );
      await endExportResponse(res);
      logger.log("[export/json] done", { quotes: quoteCount });
    } catch (error) {
      logger.error("Error exporting data:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to export data", details: error.message });
      } else {
        res.end();
      }
    }
  });

  app.get("/api/export/big-files-report", (req, res) => {
    if (lastExportBigFiles.length === 0) {
      return res.status(204).end();
    }

    const report = buildBigFilesReport(lastExportBigFiles);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="big_files_${report.date}.txt"`);
    res.send(report.text);
  });

  app.get("/api/export/big-files-info", (req, res) => {
    const totalMB = lastExportBigFiles.reduce((sum, file) => sum + parseFloat(file.sizeMB), 0);
    res.json({ count: lastExportBigFiles.length, totalMB: parseFloat(totalMB.toFixed(1)) });
  });

  app.get("/api/export/big-files-zip", (req, res) => {
    if (lastExportBigFiles.length === 0) {
      return res.status(204).end();
    }

    const date = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="big_files_${date}.zip"`);

    const archive = archiverImpl("zip", { zlib: { level: 1 } });
    archive.pipe(res);

    for (const file of lastExportBigFiles) {
      const fullPath = pathImpl.join(fileStorage.getAttachmentsDir(), file.path);
      if (fsImpl.existsSync(fullPath)) {
        archive.file(fullPath, { name: file.path });
      }
    }

    archive.finalize();

    archive.on("error", (err) => {
      logger.error("ZIP archive error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
  });

  app.post("/api/import/json", async (req, res) => {
    const client = await pool.connect();

    try {
      const { data, options } = req.body;

      if (!data || !data.authors || !data.sources || !data.quotes) {
        return res.status(400).json({ error: "Invalid import data structure" });
      }

      await client.query("BEGIN");

      const stats = {
        authors: { created: 0, updated: 0, skipped: 0 },
        sources: { created: 0, updated: 0, skipped: 0 },
        tags: { created: 0, updated: 0, skipped: 0 },
        quotes: { created: 0, updated: 0, skipped: 0 },
        errors: [],
      };

      const authorImage = (author) => author.image ?? author.thumbnail ?? "";
      const authorDesc = (author) => author.description ?? "";
      const sourceImage = (source) => source.image ?? source.thumbnail ?? "";

      for (const author of data.authors) {
        await client.query("SAVEPOINT import_author");
        try {
          if (options?.replaceExisting) {
            const result = await client.query(
              `INSERT INTO authors (name, image, description) 
               VALUES ($1, $2, $3) 
               ON CONFLICT (name) DO UPDATE 
               SET image = EXCLUDED.image, description = EXCLUDED.description
               RETURNING id, (xmax = 0) as inserted`,
              [author.name, authorImage(author), authorDesc(author)],
            );
            if (result.rows[0].inserted) {
              stats.authors.created++;
            } else {
              stats.authors.updated++;
            }
          } else {
            const existing = await client.query(
              "SELECT id FROM authors WHERE name = $1",
              [author.name],
            );
            if (existing.rows.length > 0) {
              stats.authors.skipped++;
            } else {
              await client.query(
                "INSERT INTO authors (name, image, description) VALUES ($1, $2, $3)",
                [author.name, authorImage(author), authorDesc(author)],
              );
              stats.authors.created++;
            }
          }
          await client.query("RELEASE SAVEPOINT import_author");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT import_author");
          stats.errors.push(`Author "${author.name}": ${error.message}`);
        }
      }

      for (const source of data.sources) {
        await client.query("SAVEPOINT import_source");
        try {
          if (options?.replaceExisting) {
            const result = await client.query(
              `INSERT INTO sources (name, type, image) 
               VALUES ($1, $2, $3) 
               ON CONFLICT (name) DO UPDATE 
               SET type = EXCLUDED.type, image = EXCLUDED.image
               RETURNING id, (xmax = 0) as inserted`,
              [source.name, source.type, sourceImage(source)],
            );
            if (result.rows[0].inserted) {
              stats.sources.created++;
            } else {
              stats.sources.updated++;
            }
          } else {
            const existing = await client.query(
              "SELECT id FROM sources WHERE name = $1",
              [source.name],
            );
            if (existing.rows.length > 0) {
              stats.sources.skipped++;
            } else {
              await client.query(
                "INSERT INTO sources (name, type, image) VALUES ($1, $2, $3)",
                [source.name, source.type, sourceImage(source)],
              );
              stats.sources.created++;
            }
          }
          await client.query("RELEASE SAVEPOINT import_source");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT import_source");
          stats.errors.push(`Source "${source.name}": ${error.message}`);
        }
      }

      if (data.tags && data.tags.length > 0) {
        for (const tag of data.tags) {
          await client.query("SAVEPOINT import_tag");
          try {
            if (options?.replaceExisting) {
              const result = await client.query(
                `INSERT INTO tags (name, type, created_at) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (name, type) DO UPDATE 
                 SET created_at = EXCLUDED.created_at
                 RETURNING id, (xmax = 0) as inserted`,
                [tag.name, tag.type || "quote", tag.created_at],
              );
              if (result.rows[0].inserted) {
                stats.tags.created++;
              } else {
                stats.tags.updated++;
              }
            } else {
              const existing = await client.query(
                "SELECT id FROM tags WHERE name = $1 AND type = $2",
                [tag.name, tag.type || "quote"],
              );
              if (existing.rows.length > 0) {
                stats.tags.skipped++;
              } else {
                await client.query(
                  "INSERT INTO tags (name, type, created_at) VALUES ($1, $2, $3)",
                  [tag.name, tag.type || "quote", tag.created_at],
                );
                stats.tags.created++;
              }
            }
            await client.query("RELEASE SAVEPOINT import_tag");
          } catch (error) {
            await client.query("ROLLBACK TO SAVEPOINT import_tag");
            stats.errors.push(`Tag "${tag.name}" (${tag.type}): ${error.message}`);
          }
        }
      }

      const storageThresholdMB = options?.storageThresholdMB || 1;
      await syncNotesIdSequence(client);

      for (const note of data.quotes) {
        await client.query("SAVEPOINT import_note");
        try {
          let authorId = null;
          if (note.author_name) {
            const authorResult = await client.query(
              "SELECT id FROM authors WHERE name = $1",
              [note.author_name],
            );
            if (authorResult.rows.length > 0) {
              authorId = authorResult.rows[0].id;
            }
          }

          let sourceId = null;
          if (note.source_name) {
            const sourceResult = await client.query(
              "SELECT id FROM sources WHERE name = $1",
              [note.source_name],
            );
            if (sourceResult.rows.length > 0) {
              sourceId = sourceResult.rows[0].id;
            }
          }

          let existing = { rows: [] };
          if (note.id !== null && note.id !== undefined) {
            existing = await client.query(
              `SELECT id FROM notes 
               WHERE id = $1 
               AND note_text = $2 
               AND author_id IS NOT DISTINCT FROM $3`,
              [note.id, note.note_text, authorId],
            );
          }

          if (existing.rows.length > 0) {
            stats.quotes.skipped++;
          } else {
            let idExists = { rows: [] };
            if (note.id !== null && note.id !== undefined) {
              idExists = await client.query(
                "SELECT id FROM notes WHERE id = $1",
                [note.id],
              );
            }

            let quoteId;
            const noteType = note.note_type || "quote";

            const importNoteTitle =
              note.note_title !== undefined &&
              note.note_title !== null &&
              String(note.note_title).trim() !== ""
                ? String(note.note_title).trim()
                : null;
            const importScore =
              note.score === undefined || note.score === null || note.score === ""
                ? null
                : String(note.score).trim() || null;
            const importNoteDate = toPgDateOnlyString(note.note_date);
            const hasId = note.id !== null && note.id !== undefined;

            if (hasId && idExists.rows.length > 0) {
              const insertResult = await client.query(
                `INSERT INTO notes (note_text, note_title, author_id, source_id, type, comment, note_type, note_date, score,
                                     attachment_type, created_at, updated_at, translation_group)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING id`,
                [
                  note.note_text,
                  importNoteTitle,
                  authorId,
                  sourceId,
                  note.type,
                  note.comment,
                  noteType,
                  importNoteDate,
                  importScore,
                  note.attachment_type || null,
                  note.created_at || new Date(),
                  note.updated_at || new Date(),
                  note.translation_group || null,
                ],
              );
              quoteId = insertResult.rows[0].id;
            } else if (hasId && idExists.rows.length === 0) {
              quoteId = note.id;
              await client.query(
                `INSERT INTO notes (id, note_text, note_title, author_id, source_id, type, comment, note_type, note_date, score,
                                     attachment_type, created_at, updated_at, translation_group)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                [
                  quoteId,
                  note.note_text,
                  importNoteTitle,
                  authorId,
                  sourceId,
                  note.type,
                  note.comment,
                  noteType,
                  importNoteDate,
                  importScore,
                  note.attachment_type || null,
                  note.created_at || new Date(),
                  note.updated_at || new Date(),
                  note.translation_group || null,
                ],
              );
            } else {
              const insertResult = await client.query(
                `INSERT INTO notes (note_text, note_title, author_id, source_id, type, comment, note_type, note_date, score,
                                     attachment_type, created_at, updated_at, translation_group)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 RETURNING id`,
                [
                  note.note_text,
                  importNoteTitle,
                  authorId,
                  sourceId,
                  note.type,
                  note.comment,
                  noteType,
                  importNoteDate,
                  importScore,
                  note.attachment_type || null,
                  note.created_at || new Date(),
                  note.updated_at || new Date(),
                  note.translation_group || null,
                ],
              );
              quoteId = insertResult.rows[0].id;
            }

            const storageFolder = noteType || "quotes";
            const attachmentRows = note.attachments && note.attachments.length > 0
              ? note.attachments
              : (note.thumbnail || note.attachment_full)
                ? [{
                    thumbnail: note.thumbnail,
                    attachment_full: note.attachment_full,
                    attachment_type: note.attachment_type,
                    filename: note.filename,
                    position: 0,
                  }]
                : [];

            let primaryThumb = null;
            let primaryFull = null;

            for (const attachment of attachmentRows) {
              const position = attachment.position ?? 0;
              const suffix = position === 0 ? "" : `_${position}`;
              const processedThumb = fileStorage.processForStorage(
                attachment.thumbnail,
                storageFolder,
                quoteId,
                suffix ? `${suffix}` : "",
                storageThresholdMB,
                false,
              );
              const processedFull = fileStorage.processForStorage(
                attachment.attachment_full,
                storageFolder,
                quoteId,
                position === 0 ? "" : `_${position}`,
                storageThresholdMB,
                true,
              );

              await client.query(
                `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
                 VALUES ($1, $2, $3, $4, $5, 'base64', $6)`,
                [
                  quoteId,
                  position,
                  processedThumb || null,
                  processedFull || null,
                  attachment.attachment_type || null,
                  attachment.filename || null,
                ],
              );

              if (position === 0) {
                primaryThumb = processedThumb;
                primaryFull = processedFull;
              }
            }

            if (primaryThumb || primaryFull) {
              await client.query(
                "UPDATE notes SET thumbnail = $1, attachment_full = $2 WHERE id = $3",
                [primaryThumb, primaryFull, quoteId],
              );
            }

            if (note.tag_objects && note.tag_objects.length > 0) {
              for (const tagObj of note.tag_objects) {
                const tagResult = await client.query(
                  `INSERT INTO tags (name, type) 
                   VALUES ($1, $2) 
                   ON CONFLICT (name, type) DO UPDATE SET name = tags.name
                   RETURNING id`,
                  [tagObj.name, tagObj.type || noteType],
                );
                const tagId = tagResult.rows[0].id;

                await client.query(
                  `INSERT INTO note_tags (note_id, tag_id) 
                   VALUES ($1, $2) 
                   ON CONFLICT DO NOTHING`,
                  [quoteId, tagId],
                );
              }
            }

            stats.quotes.created++;
          }
          await client.query("RELEASE SAVEPOINT import_note");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT import_note");
          const preview = (note.note_text && note.note_text.substring(0, 50)) || "";
          stats.errors.push(`Note "${preview}...": ${error.message}`);
        }
      }

      await syncNotesIdSequence(client);
      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Import completed",
        stats,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Error importing data:", error);
      res
        .status(500)
        .json({ error: "Failed to import data", details: error.message });
    } finally {
      client.release();
    }
  });
}

module.exports = {
  buildBigFilesReport,
  readExportEmbedThresholdMB,
  registerExportImportRoutes,
};
