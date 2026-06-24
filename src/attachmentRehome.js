const path = require("path");
const { normalizeAttachmentFolder } = require("./attachmentFolders");

function parseFileReference(value) {
  if (!value || typeof value !== "string" || !value.startsWith("file:")) {
    return null;
  }

  const rest = value.slice(5);
  const mimeSeparator = rest.indexOf(":");
  const relativePath = mimeSeparator >= 0 ? rest.slice(0, mimeSeparator) : rest;
  const mimeType = mimeSeparator >= 0 ? rest.slice(mimeSeparator + 1) : null;
  if (!relativePath) return null;

  return { relativePath, mimeType };
}

function isSafeAttachmentPath(relativePath) {
  if (!relativePath || relativePath.includes("\\")) return false;
  if (path.posix.isAbsolute(relativePath)) return false;
  return !relativePath.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

function replaceTopLevelFolder(relativePath, targetFolder) {
  const parts = relativePath.split("/");
  parts[0] = targetFolder;
  return parts.join("/");
}

function getRehomeColumnSql(column) {
  if (column === "attachment_full") return "attachment_full";
  if (column === "thumbnail") return "thumbnail";
  throw new Error(`Unsupported attachment column: ${column}`);
}

function buildAttachmentRehomePlan(rows, {
  attachmentsDir,
  existsSync = () => true,
  pathImpl = path,
} = {}) {
  const items = [];
  let totalFileRefs = 0;

  for (const row of rows || []) {
    const targetFolder = normalizeAttachmentFolder(row.note_type || "note", "note");

    for (const column of ["attachment_full", "thumbnail"]) {
      const parsed = parseFileReference(row[column]);
      if (!parsed) continue;
      totalFileRefs++;

      const baseItem = {
        attachmentId: row.attachment_id,
        noteId: row.note_id,
        noteType: row.note_type,
        position: row.position,
        column,
        currentRef: row[column],
        currentPath: parsed.relativePath,
        targetFolder,
      };

      if (!isSafeAttachmentPath(parsed.relativePath)) {
        items.push({ ...baseItem, status: "invalid_reference" });
        continue;
      }

      const currentFolder = parsed.relativePath.split("/")[0];
      if (currentFolder === targetFolder) continue;

      const targetPath = replaceTopLevelFolder(parsed.relativePath, targetFolder);
      const currentAbsolutePath = attachmentsDir
        ? pathImpl.join(attachmentsDir, parsed.relativePath)
        : null;
      const targetAbsolutePath = attachmentsDir
        ? pathImpl.join(attachmentsDir, targetPath)
        : null;
      const sourceExists = currentAbsolutePath ? existsSync(currentAbsolutePath) : null;
      const targetExists = targetAbsolutePath ? existsSync(targetAbsolutePath) : null;

      let status = "movable";
      if (sourceExists === false) status = "missing_source";
      else if (targetExists === true) status = "target_exists";

      items.push({
        ...baseItem,
        currentFolder,
        targetPath,
        targetRef: parsed.mimeType ? `file:${targetPath}:${parsed.mimeType}` : `file:${targetPath}`,
        sourceExists,
        targetExists,
        status,
      });
    }
  }

  return {
    totalFileRefs,
    driftCount: items.filter((item) => item.status !== "invalid_reference").length,
    movableCount: items.filter((item) => item.status === "movable").length,
    missingSourceCount: items.filter((item) => item.status === "missing_source").length,
    collisionCount: items.filter((item) => item.status === "target_exists").length,
    invalidReferenceCount: items.filter((item) => item.status === "invalid_reference").length,
    items,
  };
}

async function applyAttachmentRehomePlan(plan, {
  client,
  attachmentsDir,
  fsImpl,
  pathImpl = path,
} = {}) {
  if (!client) throw new Error("client is required");
  if (!attachmentsDir) throw new Error("attachmentsDir is required");
  if (!fsImpl) throw new Error("fsImpl is required");

  const results = [];

  for (const item of plan.items || []) {
    if (item.status !== "movable") {
      results.push({
        attachmentId: item.attachmentId,
        noteId: item.noteId,
        column: item.column,
        status: "skipped",
        reason: item.status,
      });
      continue;
    }

    const columnSql = getRehomeColumnSql(item.column);
    const sourcePath = pathImpl.join(attachmentsDir, item.currentPath);
    const targetPath = pathImpl.join(attachmentsDir, item.targetPath);

    if (!fsImpl.existsSync(sourcePath)) {
      results.push({
        attachmentId: item.attachmentId,
        noteId: item.noteId,
        column: item.column,
        status: "skipped",
        reason: "missing_source",
      });
      continue;
    }

    if (fsImpl.existsSync(targetPath)) {
      results.push({
        attachmentId: item.attachmentId,
        noteId: item.noteId,
        column: item.column,
        status: "skipped",
        reason: "target_exists",
      });
      continue;
    }

    let moved = false;
    try {
      fsImpl.mkdirSync(pathImpl.dirname(targetPath), { recursive: true });
      fsImpl.renameSync(sourcePath, targetPath);
      moved = true;

      await client.query("SAVEPOINT rehome_attachment");
      try {
        await client.query(
          `UPDATE note_attachments SET ${columnSql} = $1 WHERE id = $2`,
          [item.targetRef, item.attachmentId]
        );

        if (item.position === 0) {
          await client.query(
            `UPDATE notes SET ${columnSql} = $1 WHERE id = $2`,
            [item.targetRef, item.noteId]
          );
        }

        await client.query("RELEASE SAVEPOINT rehome_attachment");
        results.push({
          attachmentId: item.attachmentId,
          noteId: item.noteId,
          column: item.column,
          status: "moved",
          from: item.currentPath,
          to: item.targetPath,
          targetRef: item.targetRef,
        });
      } catch (dbError) {
        await client.query("ROLLBACK TO SAVEPOINT rehome_attachment").catch(() => {});
        await client.query("RELEASE SAVEPOINT rehome_attachment").catch(() => {});
        if (moved && fsImpl.existsSync(targetPath) && !fsImpl.existsSync(sourcePath)) {
          fsImpl.renameSync(targetPath, sourcePath);
          moved = false;
        }
        results.push({
          attachmentId: item.attachmentId,
          noteId: item.noteId,
          column: item.column,
          status: "failed",
          reason: "db_update_failed",
          error: dbError.message,
        });
      }
    } catch (error) {
      if (moved && fsImpl.existsSync(targetPath) && !fsImpl.existsSync(sourcePath)) {
        try {
          fsImpl.renameSync(targetPath, sourcePath);
        } catch (_) {}
      }
      results.push({
        attachmentId: item.attachmentId,
        noteId: item.noteId,
        column: item.column,
        status: "failed",
        reason: moved ? "rollback_failed" : "move_failed",
        error: error.message,
      });
    }
  }

  return {
    movedCount: results.filter((result) => result.status === "moved").length,
    skippedCount: results.filter((result) => result.status === "skipped").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    results,
  };
}

module.exports = {
  applyAttachmentRehomePlan,
  buildAttachmentRehomePlan,
  getRehomeColumnSql,
  isSafeAttachmentPath,
  parseFileReference,
  replaceTopLevelFolder,
};
