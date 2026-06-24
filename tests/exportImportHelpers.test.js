const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createAttachmentExportResolver,
  endExportResponse,
  syncNotesIdSequence,
  toPgDateOnlyString,
  writeExportChunk,
} = require("../src/exportImportHelpers");

function withTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-export-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeFileStorage(attachmentsDir) {
  return {
    isFilePath(value) {
      return typeof value === "string" && value.startsWith("file:");
    },
    parseFilePath(value) {
      const parts = value.split(":");
      return {
        path: parts[1],
        mimeType: parts[2] || "application/octet-stream",
      };
    },
    getAttachmentsDir() {
      return attachmentsDir;
    },
  };
}

test("toPgDateOnlyString preserves calendar dates from export/import values", () => {
  assert.equal(toPgDateOnlyString(null), null);
  assert.equal(toPgDateOnlyString(""), null);
  assert.equal(toPgDateOnlyString("not a date"), null);
  assert.equal(toPgDateOnlyString("2026-06-24"), "2026-06-24");
  assert.equal(toPgDateOnlyString("2026-06-24T22:15:00.000Z"), "2026-06-24");
  assert.equal(toPgDateOnlyString(new Date(2026, 5, 24, 12, 30, 0)), "2026-06-24");
});

test("createAttachmentExportResolver embeds small file references", (t) => {
  const dir = withTempDir(t);
  fs.mkdirSync(path.join(dir, "note"), { recursive: true });
  fs.writeFileSync(path.join(dir, "note", "7.txt"), "hello");
  const bigFiles = [];
  const resolveAttachmentForExport = createAttachmentExportResolver({
    fileStorage: makeFileStorage(dir),
    fsImpl: fs,
  });

  const resolved = resolveAttachmentForExport(
    "file:note/7.txt:text/plain",
    7,
    bigFiles,
    1,
  );

  assert.equal(resolved, "data:text/plain;base64,aGVsbG8=");
  assert.deepEqual(bigFiles, []);
});

test("createAttachmentExportResolver keeps missing references unchanged", (t) => {
  const dir = withTempDir(t);
  const bigFiles = [];
  const resolveAttachmentForExport = createAttachmentExportResolver({
    fileStorage: makeFileStorage(dir),
    fsImpl: fs,
  });

  const value = "file:note/missing.pdf:application/pdf";
  assert.equal(resolveAttachmentForExport(value, 9, bigFiles, 1), value);
  assert.deepEqual(bigFiles, []);
});

test("createAttachmentExportResolver records large files once per path", (t) => {
  const dir = withTempDir(t);
  fs.mkdirSync(path.join(dir, "historical"), { recursive: true });
  fs.writeFileSync(path.join(dir, "historical", "11.pdf"), Buffer.alloc(20));
  const bigFiles = [];
  const seenBigFilePaths = new Set();
  const resolveAttachmentForExport = createAttachmentExportResolver({
    fileStorage: makeFileStorage(dir),
    fsImpl: fs,
    seenBigFilePaths,
  });

  const value = "file:historical/11.pdf:application/pdf";

  assert.equal(resolveAttachmentForExport(value, 11, bigFiles, 0.000001), value);
  assert.equal(resolveAttachmentForExport(value, 12, bigFiles, 0.000001), value);
  assert.deepEqual(bigFiles, [
    { noteId: 11, path: "historical/11.pdf", sizeMB: "0.00" },
  ]);
});

test("createAttachmentExportResolver leaves non-file values unchanged", (t) => {
  const dir = withTempDir(t);
  const bigFiles = [];
  const resolveAttachmentForExport = createAttachmentExportResolver({
    fileStorage: makeFileStorage(dir),
    fsImpl: fs,
  });

  assert.equal(resolveAttachmentForExport(null, 1, bigFiles, 1), null);
  assert.equal(
    resolveAttachmentForExport("data:image/png;base64,aGVsbG8=", 1, bigFiles, 1),
    "data:image/png;base64,aGVsbG8=",
  );
  assert.deepEqual(bigFiles, []);
});

test("writeExportChunk resolves immediately when the response accepts data", async () => {
  const res = new EventEmitter();
  const calls = [];
  res.write = (chunk, encoding) => {
    calls.push({ chunk, encoding });
    return true;
  };

  await writeExportChunk(res, "hello");

  assert.deepEqual(calls, [{ chunk: "hello", encoding: "utf8" }]);
});

test("writeExportChunk waits for drain when response backpressures", async () => {
  const res = new EventEmitter();
  const calls = [];
  let drained = false;
  res.write = (chunk, encoding) => {
    calls.push({ chunk, encoding });
    setImmediate(() => {
      drained = true;
      res.emit("drain");
    });
    return false;
  };

  await writeExportChunk(res, "hello");

  assert.equal(drained, true);
  assert.deepEqual(calls, [{ chunk: "hello", encoding: "utf8" }]);
});

test("endExportResponse resolves after response end callback", async () => {
  const res = {
    ended: false,
    end(callback) {
      this.ended = true;
      callback();
    },
  };

  await endExportResponse(res);

  assert.equal(res.ended, true);
});

test("syncNotesIdSequence aligns notes id sequence when present", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/pg_get_serial_sequence/.test(sql)) {
        return { rows: [{ seq: "public.notes_id_seq" }] };
      }
      return { rows: [] };
    },
  };

  await syncNotesIdSequence(client);

  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /setval/);
  assert.deepEqual(calls[1].params, ["public.notes_id_seq"]);
});

test("syncNotesIdSequence is a no-op when no serial sequence exists", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [{ seq: null }] };
    },
  };

  await syncNotesIdSequence(client);

  assert.equal(calls.length, 1);
});

test("syncNotesIdSequence is a no-op for SQLite clients", async () => {
  const client = {
    dialect: "sqlite",
    async query() {
      throw new Error("query should not be called");
    },
  };

  await syncNotesIdSequence(client);
});
