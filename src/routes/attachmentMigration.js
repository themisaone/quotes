const fs = require("fs");
const path = require("path");

const FOLDER_RENAMES = { quotes: "quote", notes: "note", puzzles: "puzzle" };

function isFileReference(value) {
  return typeof value === "string" && value.startsWith("file:");
}

function trackCreatedFileRef(filesystemJournal, ref, originalValue = null) {
  if (isFileReference(ref) && ref !== originalValue) {
    filesystemJournal.push({ type: "created-ref", ref });
  }
}

function trackRename(filesystemJournal, from, to) {
  filesystemJournal.push({ type: "rename", from, to });
}

function rollbackFilesystemJournal(filesystemJournal, {
  fileStorage,
  fsImpl = fs,
  logger = console,
}) {
  for (const entry of [...filesystemJournal].reverse()) {
    try {
      if (entry.type === "created-ref") {
        if (typeof fileStorage.deleteAttachment === "function") {
          fileStorage.deleteAttachment(entry.ref);
        }
      } else if (
        entry.type === "rename" &&
        fsImpl.existsSync(entry.to) &&
        !fsImpl.existsSync(entry.from)
      ) {
        fsImpl.renameSync(entry.to, entry.from);
      }
    } catch (error) {
      logger.error("Migration filesystem rollback failed:", error);
    }
  }
}

async function consolidateLegacyAttachmentFolders({
  client,
  fileStorage,
  fsImpl = fs,
  pathImpl = path,
  filesystemJournal = [],
}) {
  let consolidated = 0;

  for (const [oldFolder, newFolder] of Object.entries(FOLDER_RENAMES)) {
    const oldDir = pathImpl.join(fileStorage.getAttachmentsDir(), oldFolder);
    const newDir = pathImpl.join(fileStorage.getAttachmentsDir(), newFolder);
    if (!fsImpl.existsSync(oldDir)) continue;
    fsImpl.mkdirSync(newDir, { recursive: true });

    const oldPrefix = `file:${oldFolder}/`;
    const newPrefix = `file:${newFolder}/`;
    const [naRefs, nRefs] = await Promise.all([
      client.query(
        "SELECT id, attachment_full FROM note_attachments WHERE attachment_full LIKE $1",
        [`${oldPrefix}%`]
      ),
      client.query(
        "SELECT id, attachment_full FROM notes WHERE attachment_full LIKE $1",
        [`${oldPrefix}%`]
      ),
    ]);

    for (const row of [...naRefs.rows, ...nRefs.rows]) {
      const newRef = row.attachment_full.replace(oldPrefix, newPrefix);
      const oldRelPath = row.attachment_full.replace(/^file:/, "").split(":")[0];
      const newRelPath = newRef.replace(/^file:/, "").split(":")[0];
      const oldFileFull = pathImpl.join(fileStorage.getAttachmentsDir(), oldRelPath);
      const newFileFull = pathImpl.join(fileStorage.getAttachmentsDir(), newRelPath);
      if (fsImpl.existsSync(oldFileFull) && !fsImpl.existsSync(newFileFull)) {
        fsImpl.renameSync(oldFileFull, newFileFull);
        trackRename(filesystemJournal, oldFileFull, newFileFull);
      }
      const table = naRefs.rows.includes(row) ? "note_attachments" : "notes";
      await client.query(`UPDATE ${table} SET attachment_full = $1 WHERE id = $2`, [newRef, row.id]);
      consolidated++;
    }
  }

  return consolidated;
}

async function migrateNoteAttachmentRows({ client, fileStorage, filesystemJournal = [] }) {
  const naRows = await client.query(`
      SELECT na.id, na.note_id, na.position, na.attachment_full, na.attachment_type,
             n.note_type
      FROM note_attachments na
      JOIN notes n ON n.id = na.note_id
      WHERE na.attachment_full IS NOT NULL
        AND na.attachment_full NOT LIKE 'file:%'
        AND LENGTH(na.attachment_full) > 100
      ORDER BY na.note_id, na.position
    `);

  let migrated = 0;
  let skipped = 0;

  for (const row of naRows.rows) {
    const raw = row.attachment_full;
    if (!raw || !raw.startsWith("data:")) {
      skipped++;
      continue;
    }

    const folder = row.note_type || "note";
    const fileId = row.position === 0 ? `${row.note_id}` : `${row.note_id}_a${row.position}`;
    const newRef = fileStorage.processForStorage(raw, folder, fileId, "", 0, true);
    trackCreatedFileRef(filesystemJournal, newRef, raw);
    if (!newRef || !fileStorage.isFilePath(newRef)) {
      skipped++;
      continue;
    }

    await client.query(
      "UPDATE note_attachments SET attachment_full = $1 WHERE id = $2",
      [newRef, row.id]
    );
    migrated++;
  }

  return { migrated, skipped };
}

async function migrateFlatNoteRows({ client, fileStorage, filesystemJournal = [] }) {
  const flatRows = await client.query(`
      SELECT n.id, n.note_type, n.attachment_full
      FROM notes n
      WHERE n.attachment_full IS NOT NULL
        AND n.attachment_full NOT LIKE 'file:%'
        AND LENGTH(n.attachment_full) > 100
        AND NOT EXISTS (
          SELECT 1 FROM note_attachments na
          WHERE na.note_id = n.id AND na.attachment_full = n.attachment_full
        )
    `);

  let migrated = 0;
  let skipped = 0;

  for (const row of flatRows.rows) {
    const raw = row.attachment_full;
    if (!raw || !raw.startsWith("data:")) {
      skipped++;
      continue;
    }

    const folder = row.note_type || "note";
    const newRef = fileStorage.processForStorage(raw, folder, `${row.id}`, "", 0, true);
    trackCreatedFileRef(filesystemJournal, newRef, raw);
    if (!newRef || !fileStorage.isFilePath(newRef)) {
      skipped++;
      continue;
    }

    await client.query(
      "UPDATE notes SET attachment_full = $1 WHERE id = $2",
      [newRef, row.id]
    );
    migrated++;
  }

  return { migrated, skipped };
}

async function fixTmpAttachmentRefs({
  client,
  fileStorage,
  fsImpl = fs,
  pathImpl = path,
  filesystemJournal = [],
}) {
  const tmpRefRows = await client.query(`
      SELECT 'na' AS tbl, na.id AS row_id, na.note_id, na.position,
             na.attachment_full, n.attachment_full AS notes_full, n.note_type
      FROM note_attachments na
      JOIN notes n ON n.id = na.note_id
      WHERE na.attachment_full LIKE 'file:%/tmp_%:%'
      UNION ALL
      SELECT 'note' AS tbl, n.id AS row_id, n.id AS note_id, -1 AS position,
             n.attachment_full, n.attachment_full AS notes_full, n.note_type
      FROM notes n
      WHERE n.attachment_full LIKE 'file:%/tmp_%:%'
    `);

  let fixed = 0;
  let cleared = 0;

  for (const row of tmpRefRows.rows) {
    const { path: relPath, mimeType } = fileStorage.parseFilePath(row.attachment_full);
    const basename = pathImpl.basename(relPath);
    const dir = pathImpl.dirname(relPath);
    const ext = pathImpl.extname(basename);
    const fileId = row.position <= 0 ? `${row.note_id}` : `${row.note_id}_a${row.position}`;
    const newBasename = `${fileId}${ext}`;
    const newRelPath = `${dir}/${newBasename}`;

    const oldFull = pathImpl.join(fileStorage.getAttachmentsDir(), relPath);
    const newFull = pathImpl.join(fileStorage.getAttachmentsDir(), newRelPath);

    let newRef = null;
    if (fsImpl.existsSync(oldFull)) {
      if (!fsImpl.existsSync(newFull)) {
        fsImpl.renameSync(oldFull, newFull);
        trackRename(filesystemJournal, oldFull, newFull);
      }
      newRef = fileStorage.createFileReference(newRelPath, mimeType);
      fixed++;
    } else if (
      row.tbl === "na" &&
      row.notes_full &&
      fileStorage.isFilePath(row.notes_full) &&
      !row.notes_full.includes("/tmp_")
    ) {
      newRef = row.notes_full;
      fixed++;
    } else {
      cleared++;
    }

    if (row.tbl === "na") {
      await client.query(
        "UPDATE note_attachments SET attachment_full = $1 WHERE id = $2",
        [newRef, row.row_id]
      );
    } else {
      await client.query(
        "UPDATE notes SET attachment_full = $1 WHERE id = $2",
        [newRef, row.row_id]
      );
    }
  }

  return { fixed, cleared };
}

async function syncFlatAndPrimaryAttachmentRefs(client) {
  await client.query(`
      UPDATE notes n
      SET attachment_full = na.attachment_full,
          attachment_type  = na.attachment_type
      FROM note_attachments na
      WHERE na.note_id = n.id AND na.position = 0
        AND na.attachment_full LIKE 'file:%'
        AND (n.attachment_full IS NULL OR n.attachment_full = '' OR n.attachment_full NOT LIKE 'file:%')
    `);

  await client.query(`
      UPDATE note_attachments na
      SET attachment_full = n.attachment_full,
          attachment_type  = n.attachment_type
      FROM notes n
      WHERE na.note_id = n.id AND na.position = 0
        AND n.attachment_full LIKE 'file:%'
        AND (na.attachment_full IS NULL OR na.attachment_full = '')
    `);
}

async function runAttachmentDiskMigration({
  client,
  fileStorage,
  fsImpl = fs,
  pathImpl = path,
  filesystemJournal = [],
}) {
  const consolidated = await consolidateLegacyAttachmentFolders({
    client,
    fileStorage,
    fsImpl,
    pathImpl,
    filesystemJournal,
  });

  const noteAttachmentResult = await migrateNoteAttachmentRows({
    client,
    fileStorage,
    filesystemJournal,
  });
  const flatResult = await migrateFlatNoteRows({
    client,
    fileStorage,
    filesystemJournal,
  });
  const tmpResult = await fixTmpAttachmentRefs({
    client,
    fileStorage,
    fsImpl,
    pathImpl,
    filesystemJournal,
  });
  await syncFlatAndPrimaryAttachmentRefs(client);

  return {
    migrated: noteAttachmentResult.migrated + flatResult.migrated,
    consolidated,
    fixed: tmpResult.fixed,
    cleared: tmpResult.cleared,
    skipped: noteAttachmentResult.skipped + flatResult.skipped,
  };
}

function registerAttachmentMigrationRoutes(app, {
  pool,
  fileStorage,
  fsImpl = fs,
  pathImpl = path,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!pool) throw new Error("pool is required");
  if (!fileStorage) throw new Error("fileStorage is required");

  app.post("/api/migrate/attachments-to-disk", async (req, res) => {
    const client = await pool.connect();
    const filesystemJournal = [];

    try {
      await client.query("BEGIN");
      const stats = await runAttachmentDiskMigration({
        client,
        fileStorage,
        fsImpl,
        pathImpl,
        filesystemJournal,
      });
      await client.query("COMMIT");
      res.json({ ok: true, ...stats });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logger.error("Migration DB rollback failed:", rollbackError);
      }
      rollbackFilesystemJournal(filesystemJournal, {
        fileStorage,
        fsImpl,
        logger,
      });
      logger.error("Migration error:", err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });
}

module.exports = {
  FOLDER_RENAMES,
  consolidateLegacyAttachmentFolders,
  fixTmpAttachmentRefs,
  migrateFlatNoteRows,
  migrateNoteAttachmentRows,
  registerAttachmentMigrationRoutes,
  rollbackFilesystemJournal,
  runAttachmentDiskMigration,
  syncFlatAndPrimaryAttachmentRefs,
};
