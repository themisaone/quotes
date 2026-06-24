const path = require("path");

/**
 * Resolve a single attachment value for JSON export:
 * - null / undefined / base64 string -> returned as-is
 * - file: reference, file <= threshold -> read from disk, return base64 data URL
 * - file: reference, file > threshold -> add to bigFiles list, return original ref
 */
function createAttachmentExportResolver({
  fileStorage,
  fsImpl,
  pathImpl = path,
  seenBigFilePaths = new Set(),
}) {
  if (!fileStorage) throw new Error("fileStorage is required");
  if (!fsImpl) throw new Error("fsImpl is required");

  return function resolveAttachmentForExport(value, noteId, bigFiles, thresholdMB = 1) {
    if (!value || !fileStorage.isFilePath(value)) return value;

    const { path: relPath, mimeType } = fileStorage.parseFilePath(value);
    const fullPath = pathImpl.join(fileStorage.getAttachmentsDir(), relPath);

    if (!fsImpl.existsSync(fullPath)) return value;

    const sizeBytes = fsImpl.statSync(fullPath).size;
    const sizeMB = sizeBytes / 1024 / 1024;

    if (sizeMB > thresholdMB) {
      if (!seenBigFilePaths.has(relPath)) {
        seenBigFilePaths.add(relPath);
        bigFiles.push({ noteId, path: relPath, sizeMB: sizeMB.toFixed(2) });
      }
      return value;
    }

    const buffer = fsImpl.readFileSync(fullPath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  };
}

/**
 * Normalize a value for PostgreSQL DATE (calendar day only).
 * Export avoids JSON.stringify(Date) -> ISO midnight shifting on re-import.
 * Import accepts legacy ISO strings and stores the intended calendar day.
 */
function toPgDateOnlyString(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "string") {
    const m = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const mo = String(val.getMonth() + 1).padStart(2, "0");
    const day = String(val.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  return null;
}

/** Honor TCP backpressure so chunked JSON export does not buffer unbounded RAM. */
function writeExportChunk(res, chunk, encoding = "utf8") {
  return new Promise((resolve, reject) => {
    const onErr = (err) => {
      res.off("drain", onDrain);
      reject(err);
    };
    const onDrain = () => {
      res.off("error", onErr);
      resolve();
    };
    res.once("error", onErr);
    try {
      const ok =
        typeof chunk === "string"
          ? res.write(chunk, encoding)
          : res.write(chunk);
      if (ok) {
        res.off("error", onErr);
        resolve();
      } else {
        res.once("drain", onDrain);
      }
    } catch (e) {
      res.off("error", onErr);
      reject(e);
    }
  });
}

function endExportResponse(res) {
  return new Promise((resolve, reject) => {
    res.end((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Align notes.id SERIAL with MAX(id). Required for JSON import when the
 * sequence is behind manual restores or older tools.
 */
async function syncNotesIdSequence(client) {
  if (client?.dialect === "sqlite") return;

  const { rows } = await client.query(
    "SELECT pg_get_serial_sequence('notes', 'id') AS seq",
  );
  const seq = rows[0]?.seq;
  if (!seq) return;
  await client.query(
    `SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM notes), 1), true)`,
    [seq],
  );
}

module.exports = {
  createAttachmentExportResolver,
  endExportResponse,
  syncNotesIdSequence,
  toPgDateOnlyString,
  writeExportChunk,
};
