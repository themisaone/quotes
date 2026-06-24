const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const fileStorage = require("../src/fileStorage");

function withTempAttachmentsDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-attachments-"));
  fileStorage.setAttachmentsDirAbsolute(dir);
  t.after(() => {
    fileStorage.setAttachmentsDirAbsolute(null);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test("parses and sizes base64 data URLs", () => {
  const dataUrl = "data:image/png;base64,aGVsbG8=";

  assert.deepEqual(fileStorage.parseBase64Data(dataUrl), {
    mimeType: "image/png",
    data: "aGVsbG8=",
  });
  assert.equal(fileStorage.getBase64Size(dataUrl), 5);
  assert.equal(fileStorage.getMimeTypeFromBase64(dataUrl), "image/png");
});

test("creates and parses file references", () => {
  const reference = fileStorage.createFileReference("note/42.png", "image/png");

  assert.equal(reference, "file:note/42.png:image/png");
  assert.equal(fileStorage.isFilePath(reference), true);
  assert.deepEqual(fileStorage.parseFilePath(reference), {
    path: "note/42.png",
    mimeType: "image/png",
  });
  assert.equal(fileStorage.parseFilePath("data:image/png;base64,aGVsbG8="), null);
});

test("stores and retrieves forced external attachments", (t) => {
  const dir = withTempAttachmentsDir(t);
  const dataUrl = "data:image/png;base64,aGVsbG8=";

  const stored = fileStorage.processForStorage(dataUrl, "note", 42, "", 1, true);

  assert.equal(stored, "file:note/42.png:image/png");
  assert.equal(fs.readFileSync(path.join(dir, "note", "42.png"), "utf8"), "hello");
  assert.equal(fileStorage.retrieveFromStorage(stored), dataUrl);
});

test("finalizes temporary upload file names", (t) => {
  const dir = withTempAttachmentsDir(t);
  const noteDir = path.join(dir, "note");
  fs.mkdirSync(noteDir, { recursive: true });
  fs.writeFileSync(path.join(noteDir, "tmp_upload.png"), "hello");

  const finalized = fileStorage.finalizeUploadedFile(
    "file:note/tmp_upload.png:image/png",
    99
  );

  assert.equal(finalized, "file:note/99.png:image/png");
  assert.equal(fs.existsSync(path.join(noteDir, "tmp_upload.png")), false);
  assert.equal(fs.readFileSync(path.join(noteDir, "99.png"), "utf8"), "hello");
});
