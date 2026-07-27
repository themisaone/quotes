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
const { createDefaultSettings } = require("./settings");

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

function readSettingsOrDefault({ fsImpl, getSettingsFile }) {
  const defaults = createDefaultSettings();
  let parsed = {};

  try {
    const settingsFile = getSettingsFile();
    if (fsImpl.existsSync(settingsFile)) {
      parsed = JSON.parse(fsImpl.readFileSync(settingsFile, "utf8"));
    }
  } catch (_) {
    parsed = {};
  }

  const settings =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...defaults, ...parsed }
      : defaults;

  if (!Array.isArray(settings.noteTypes)) {
    settings.noteTypes = defaults.noteTypes;
  }
  if (defaults.colors || parsed.colors) {
    settings.colors = { ...(defaults.colors || {}), ...(parsed.colors || {}) };
  }

  return settings;
}

function normalizeNoteTypeValue(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function labelFromNoteTypeValue(value) {
  const label = String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return label || "Custom";
}

function normalizeImportedNoteType(definition, fallbackValue) {
  const value = normalizeNoteTypeValue(definition?.value || fallbackValue);
  if (!value) return null;

  const behavior = ["quote", "training", "generic"].includes(definition?.behavior)
    ? definition.behavior
    : "generic";

  return {
    ...(definition && typeof definition === "object" ? definition : {}),
    value,
    label: definition?.label || labelFromNoteTypeValue(value),
    icon: definition?.icon || "📌",
    behavior,
    defaultDisplayMode:
      definition?.defaultDisplayMode || (behavior === "training" ? "calendar" : "cards"),
  };
}

function collectReferencedNoteTypeValues(data) {
  const values = new Set();
  for (const note of data?.quotes || []) {
    values.add(normalizeNoteTypeValue(note?.note_type || "quote"));
  }
  values.delete(null);
  return values;
}

function collectImportedNoteTypeDefinitions(data, referencedValues) {
  const definitions = new Map();
  const exportedNoteTypes = Array.isArray(data?.noteTypes)
    ? data.noteTypes
    : Array.isArray(data?.settings?.noteTypes)
      ? data.settings.noteTypes
      : [];

  for (const definition of exportedNoteTypes) {
    const normalized = normalizeImportedNoteType(definition);
    if (!normalized || !referencedValues.has(normalized.value)) continue;
    definitions.set(normalized.value, normalized);
  }

  return definitions;
}

function getConfiguredNoteTypeValues({ fsImpl, getSettingsFile }) {
  const settings = readSettingsOrDefault({ fsImpl, getSettingsFile });
  return new Set(
    settings.noteTypes.map((type) => normalizeNoteTypeValue(type?.value)).filter(Boolean),
  );
}

function findUndefinedImportedNoteTypes({ data, fsImpl, getSettingsFile }) {
  const referencedValues = collectReferencedNoteTypeValues(data);
  if (referencedValues.size === 0) return [];

  const configuredValues = getConfiguredNoteTypeValues({ fsImpl, getSettingsFile });
  const importedDefinitions = collectImportedNoteTypeDefinitions(data, referencedValues);
  const missing = [];

  for (const value of referencedValues) {
    if (!configuredValues.has(value) && !importedDefinitions.has(value)) {
      missing.push(value);
    }
  }

  return missing;
}

function addImportedNoteTypesToSettings({
  data,
  fsImpl,
  pathImpl = path,
  getSettingsFile,
  logger = console,
}) {
  const referencedValues = collectReferencedNoteTypeValues(data);
  if (referencedValues.size === 0) return [];

  const settings = readSettingsOrDefault({ fsImpl, getSettingsFile });
  const existingValues = new Set(
    settings.noteTypes.map((type) => normalizeNoteTypeValue(type?.value)).filter(Boolean),
  );
  const definitions = collectImportedNoteTypeDefinitions(data, referencedValues);
  const added = [];

  for (const [value, definition] of definitions) {
    if (existingValues.has(value)) continue;
    settings.noteTypes.push(definition);
    existingValues.add(value);
    added.push(value);
  }

  if (added.length === 0) return [];

  const settingsFile = getSettingsFile();
  fsImpl.mkdirSync(pathImpl.dirname(settingsFile), { recursive: true });
  fsImpl.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  logger.log(`[import/json] added note types to settings: ${added.join(", ")}`);
  return added;
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

function isFileReference(value) {
  return typeof value === "string" && value.startsWith("file:");
}

function trackNewFileRef(refs, ref, originalValue = null) {
  if (isFileReference(ref) && ref !== originalValue) refs.add(ref);
}

function deleteAttachmentRefs(refs, { fileStorage, logger, label }) {
  if (typeof fileStorage.deleteAttachment !== "function") return;

  for (const ref of refs) {
    try {
      fileStorage.deleteAttachment(ref);
    } catch (error) {
      logger.error(`${label} attachment cleanup failed:`, error);
    }
  }
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
      const exportSettings = readSettingsOrDefault({ fsImpl, getSettingsFile });
      const noteTypesForExport = Array.isArray(exportSettings.noteTypes)
        ? exportSettings.noteTypes
        : [];

      logger.log("[export/json] start", {
        note_type: note_type || "all",
        exportEmbedThresholdMB,
      });

      const authorsResult = note_type
        ? await pool.query(
          `SELECT DISTINCT a.*
             FROM authors a
             JOIN notes q ON q.author_id = a.id
            WHERE COALESCE(q.note_type, 'quote') = $1
            ORDER BY a.id`,
          [note_type],
        )
        : await pool.query("SELECT * FROM authors ORDER BY id");
      const sourcesResult = note_type
        ? await pool.query(
          `SELECT DISTINCT s.*
             FROM sources s
             JOIN notes q ON q.source_id = s.id
            WHERE COALESCE(q.note_type, 'quote') = $1
            ORDER BY s.id`,
          [note_type],
        )
        : await pool.query("SELECT * FROM sources ORDER BY id");
      const tagsResult = note_type
        ? await pool.query(
          `SELECT DISTINCT t.*
             FROM tags t
             JOIN note_tags nt ON nt.tag_id = t.id
             JOIN notes q ON q.id = nt.note_id
            WHERE COALESCE(q.note_type, 'quote') = $1
            ORDER BY t.id`,
          [note_type],
        )
        : await pool.query("SELECT * FROM tags    ORDER BY id");

      const countParams = note_type ? [note_type] : [];
      const countResult = await pool.query(
        `SELECT COUNT(*) AS count FROM notes${note_type ? " WHERE COALESCE(note_type, 'quote') = $1" : ""}`,
        countParams,
      );
      const quoteCount = parseInt(countResult.rows[0].count, 10);

      const counts = {
        authors: authorsResult.rows.length,
        sources: sourcesResult.rows.length,
        tags: tagsResult.rows.length,
        quotes: quoteCount,
      };

      // Entity images are intentionally small (the browser resizes them to
      // 300px). Always embed them so a JSON backup remains portable even
      // though the live DB stores only vault file references.
      const exportedAuthors = authorsResult.rows.map((author) => ({
        ...author,
        image: resolveAttachmentForExport(
          author.image,
          author.id,
          lastExportBigFiles,
          Number.POSITIVE_INFINITY,
        ),
      }));
      const exportedSources = sourcesResult.rows.map((source) => ({
        ...source,
        image: resolveAttachmentForExport(
          source.image,
          source.id,
          lastExportBigFiles,
          Number.POSITIVE_INFINITY,
        ),
      }));

      await writeExportChunk(res, '{"version":"2.0"');
      await writeExportChunk(res, `,"exportedAt":${JSON.stringify(new Date().toISOString())}`);
      await writeExportChunk(res, `,"noteTypeFilter":${JSON.stringify(note_type || "all")}`);
      await writeExportChunk(res, `,"counts":${JSON.stringify(counts)}`);
      await writeExportChunk(res, `,"data":{"authors":${JSON.stringify(exportedAuthors)}`);
      await writeExportChunk(res, `,"sources":${JSON.stringify(exportedSources)}`);
      await writeExportChunk(res, `,"tags":${JSON.stringify(tagsResult.rows)}`);
      await writeExportChunk(res, `,"noteTypes":${JSON.stringify(noteTypesForExport)}`);
      await writeExportChunk(res, ',"quotes":[');

      const batchSize = 200;
      let lastId = 0;
      let first = true;
      const noteTypeClause = note_type ? "AND COALESCE(q.note_type, 'quote') = $3" : "";

      while (true) {
        const params = note_type ? [lastId, batchSize, note_type] : [lastId, batchSize];
        const batch = await pool.query(
          `SELECT q.*,
                  a.name AS author_name,
                  s.name AS source_name
           FROM notes q
           LEFT JOIN authors   a  ON a.id = q.author_id
           LEFT JOIN sources   s  ON s.id = q.source_id
           WHERE q.id > $1 ${noteTypeClause}
           ORDER BY q.id
           LIMIT $2`,
          params,
        );

        if (batch.rows.length === 0) break;

        const noteIds = batch.rows.map((row) => row.id);
        const tagsByNote = new Map();
        const attachmentsByNote = new Map();
        if (noteIds.length > 0) {
          const tagsResult = await pool.query(
            `SELECT nt.note_id, t.id, t.name, t.type
             FROM note_tags nt
             JOIN tags t ON t.id = nt.tag_id
             WHERE nt.note_id = ANY($1::int[])
             ORDER BY nt.note_id, t.name`,
            [noteIds],
          );
          for (const tag of tagsResult.rows) {
            if (!tagsByNote.has(tag.note_id)) {
              tagsByNote.set(tag.note_id, []);
            }
            tagsByNote.get(tag.note_id).push({
              id: tag.id,
              name: tag.name,
              type: tag.type,
            });
          }

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
          note.tag_objects = tagsByNote.get(note.id) || [];
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
    const importedAttachmentRefs = new Set();
    const replacedEntityImageRefs = new Set();
    let committed = false;

    try {
      const { data, options } = req.body;

      if (!data || !data.authors || !data.sources || !data.quotes) {
        return res.status(400).json({ error: "Invalid import data structure" });
      }

      const undefinedNoteTypes = findUndefinedImportedNoteTypes({ data, fsImpl, getSettingsFile });
      if (undefinedNoteTypes.length > 0) {
        return res.status(400).json({
          error: "Import references note types that are not configured",
          noteTypes: undefinedNoteTypes,
          details:
            "Add these note types in Options, or import a backup that includes note type definitions.",
        });
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

      const storeEntityImage = (value, folder, entityId, refs) => {
        const stored = fileStorage.processForStorage(
          value,
          folder,
          entityId,
          "",
          0,
          true,
        );
        trackNewFileRef(refs, stored, value);
        return stored;
      };

      for (const author of data.authors) {
        const entityImageRefs = new Set();
        const replacedRefs = new Set();
        await client.query("SAVEPOINT import_author");
        try {
          if (options?.replaceExisting) {
            const existing = await client.query(
              "SELECT id, image FROM authors WHERE name = $1",
              [author.name],
            );
            const upserted = await client.query(
              `INSERT INTO authors (name, image, description) 
               VALUES ($1, $2, $3) 
               ON CONFLICT (name) DO UPDATE 
               SET image = EXCLUDED.image, description = EXCLUDED.description
               RETURNING id`,
              [author.name, authorImage(author), authorDesc(author)],
            );
            const entityId = upserted.rows[0].id;
            const storedImage = storeEntityImage(
              authorImage(author),
              "authors",
              entityId,
              entityImageRefs,
            );
            await client.query("UPDATE authors SET image = $1 WHERE id = $2", [storedImage, entityId]);
            const oldImage = existing.rows[0]?.image;
            if (isFileReference(oldImage) && oldImage !== storedImage) replacedRefs.add(oldImage);
            if (existing.rows.length > 0) {
              stats.authors.updated++;
            } else {
              stats.authors.created++;
            }
          } else {
            const existing = await client.query(
              "SELECT id FROM authors WHERE name = $1",
              [author.name],
            );
            if (existing.rows.length > 0) {
              stats.authors.skipped++;
            } else {
              const inserted = await client.query(
                "INSERT INTO authors (name, image, description) VALUES ($1, $2, $3) RETURNING id",
                [author.name, authorImage(author), authorDesc(author)],
              );
              const entityId = inserted.rows[0].id;
              const storedImage = storeEntityImage(
                authorImage(author),
                "authors",
                entityId,
                entityImageRefs,
              );
              await client.query("UPDATE authors SET image = $1 WHERE id = $2", [storedImage, entityId]);
              stats.authors.created++;
            }
          }
          await client.query("RELEASE SAVEPOINT import_author");
          for (const ref of entityImageRefs) importedAttachmentRefs.add(ref);
          for (const ref of replacedRefs) replacedEntityImageRefs.add(ref);
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT import_author");
          deleteAttachmentRefs(entityImageRefs, {
            fileStorage,
            logger,
            label: "import-author rollback",
          });
          stats.errors.push(`Author "${author.name}": ${error.message}`);
        }
      }

      for (const source of data.sources) {
        const entityImageRefs = new Set();
        const replacedRefs = new Set();
        await client.query("SAVEPOINT import_source");
        try {
          if (options?.replaceExisting) {
            const existing = await client.query(
              "SELECT id, image FROM sources WHERE name = $1",
              [source.name],
            );
            const upserted = await client.query(
              `INSERT INTO sources (name, type, image) 
               VALUES ($1, $2, $3) 
               ON CONFLICT (name) DO UPDATE 
               SET type = EXCLUDED.type, image = EXCLUDED.image
               RETURNING id`,
              [source.name, source.type, sourceImage(source)],
            );
            const entityId = upserted.rows[0].id;
            const storedImage = storeEntityImage(
              sourceImage(source),
              "sources",
              entityId,
              entityImageRefs,
            );
            await client.query("UPDATE sources SET image = $1 WHERE id = $2", [storedImage, entityId]);
            const oldImage = existing.rows[0]?.image;
            if (isFileReference(oldImage) && oldImage !== storedImage) replacedRefs.add(oldImage);
            if (existing.rows.length > 0) {
              stats.sources.updated++;
            } else {
              stats.sources.created++;
            }
          } else {
            const existing = await client.query(
              "SELECT id FROM sources WHERE name = $1",
              [source.name],
            );
            if (existing.rows.length > 0) {
              stats.sources.skipped++;
            } else {
              const inserted = await client.query(
                "INSERT INTO sources (name, type, image) VALUES ($1, $2, $3) RETURNING id",
                [source.name, source.type, sourceImage(source)],
              );
              const entityId = inserted.rows[0].id;
              const storedImage = storeEntityImage(
                sourceImage(source),
                "sources",
                entityId,
                entityImageRefs,
              );
              await client.query("UPDATE sources SET image = $1 WHERE id = $2", [storedImage, entityId]);
              stats.sources.created++;
            }
          }
          await client.query("RELEASE SAVEPOINT import_source");
          for (const ref of entityImageRefs) importedAttachmentRefs.add(ref);
          for (const ref of replacedRefs) replacedEntityImageRefs.add(ref);
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT import_source");
          deleteAttachmentRefs(entityImageRefs, {
            fileStorage,
            logger,
            label: "import-source rollback",
          });
          stats.errors.push(`Source "${source.name}": ${error.message}`);
        }
      }

      if (data.tags && data.tags.length > 0) {
        for (const tag of data.tags) {
          await client.query("SAVEPOINT import_tag");
          try {
            if (options?.replaceExisting) {
              const existing = await client.query(
                "SELECT id FROM tags WHERE name = $1 AND type = $2",
                [tag.name, tag.type || "quote"],
              );
              await client.query(
                `INSERT INTO tags (name, type, created_at) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (name, type) DO UPDATE 
                 SET created_at = EXCLUDED.created_at
                 RETURNING id`,
                [tag.name, tag.type || "quote", tag.created_at],
              );
              if (existing.rows.length > 0) {
                stats.tags.updated++;
              } else {
                stats.tags.created++;
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
      const noteTypeBehaviors = new Map(
        readSettingsOrDefault({ fsImpl, getSettingsFile }).noteTypes
          .map((noteType) => [noteType?.value, noteType?.behavior || "generic"]),
      );
      await syncNotesIdSequence(client);

      for (const note of data.quotes) {
        const noteAttachmentRefs = new Set();
        await client.query("SAVEPOINT import_note");
        try {
          const noteType = note.note_type || "quote";
          const supportsAuthorSource = noteTypeBehaviors.get(noteType) === "quote";
          let authorId = null;
          if (supportsAuthorSource && note.author_name) {
            const authorResult = await client.query(
              "SELECT id FROM authors WHERE name = $1",
              [note.author_name],
            );
            if (authorResult.rows.length > 0) {
              authorId = authorResult.rows[0].id;
            }
          }

          let sourceId = null;
          if (supportsAuthorSource && note.source_name) {
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
            const importType = note.type ?? null;
            const importComment = note.comment ?? null;
            const importAttachmentType = note.attachment_type ?? null;
            const importCreatedAt = note.created_at || new Date();
            const importUpdatedAt = note.updated_at || new Date();
            const importTranslationGroup = note.translation_group ?? null;

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
                  importType,
                  importComment,
                  noteType,
                  importNoteDate,
                  importScore,
                  importAttachmentType,
                  importCreatedAt,
                  importUpdatedAt,
                  importTranslationGroup,
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
                  importType,
                  importComment,
                  noteType,
                  importNoteDate,
                  importScore,
                  importAttachmentType,
                  importCreatedAt,
                  importUpdatedAt,
                  importTranslationGroup,
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
                  importType,
                  importComment,
                  noteType,
                  importNoteDate,
                  importScore,
                  importAttachmentType,
                  importCreatedAt,
                  importUpdatedAt,
                  importTranslationGroup,
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
              trackNewFileRef(noteAttachmentRefs, processedThumb, attachment.thumbnail);
              const processedFull = fileStorage.processForStorage(
                attachment.attachment_full,
                storageFolder,
                quoteId,
                position === 0 ? "" : `_${position}`,
                storageThresholdMB,
                true,
              );
              trackNewFileRef(noteAttachmentRefs, processedFull, attachment.attachment_full);

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
                   ON CONFLICT (name, type) DO UPDATE SET name = EXCLUDED.name
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
          for (const ref of noteAttachmentRefs) importedAttachmentRefs.add(ref);
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT import_note");
          deleteAttachmentRefs(noteAttachmentRefs, {
            fileStorage,
            logger,
            label: "import-note rollback",
          });
          const preview = (note.note_text && note.note_text.substring(0, 50)) || "";
          stats.errors.push(`Note "${preview}...": ${error.message}`);
        }
      }

      await syncNotesIdSequence(client);
      await client.query("COMMIT");
      committed = true;
      deleteAttachmentRefs(replacedEntityImageRefs, {
        fileStorage,
        logger,
        label: "import replaced entity image",
      });

      const noteTypesAdded = [];
      const warnings = [];
      try {
        noteTypesAdded.push(...addImportedNoteTypesToSettings({
          data,
          fsImpl,
          pathImpl,
          getSettingsFile,
          logger,
        }));
      } catch (settingsError) {
        const message = `Imported notes, but could not update note types in settings: ${settingsError.message}`;
        logger.warn(`[import/json] ${message}`);
        warnings.push(message);
      }

      const response = {
        success: true,
        message: "Import completed",
        stats,
      };
      if (noteTypesAdded.length > 0) response.noteTypesAdded = noteTypesAdded;
      if (warnings.length > 0) response.warnings = warnings;
      res.json(response);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logger.error("Import rollback failed:", rollbackError);
      }
      if (!committed) {
        deleteAttachmentRefs(importedAttachmentRefs, {
          fileStorage,
          logger,
          label: "import rollback",
        });
      }
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
  addImportedNoteTypesToSettings,
  buildBigFilesReport,
  collectImportedNoteTypeDefinitions,
  collectReferencedNoteTypeValues,
  findUndefinedImportedNoteTypes,
  readExportEmbedThresholdMB,
  readSettingsOrDefault,
  registerExportImportRoutes,
};
