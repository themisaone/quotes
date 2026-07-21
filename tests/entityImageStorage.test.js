const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const fileStorage = require("../src/fileStorage");
const {
  processEntityImageForStorage,
  resolveEntityImageUpdate,
} = require("../src/entityImageStorage");

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("processEntityImageForStorage writes author image to vault folder", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "entity-img-"));
  fileStorage.setAttachmentsDirAbsolute(path.join(tmpRoot, "attachments"));

  try {
    const stored = processEntityImageForStorage(PNG_DATA_URL, "authors", 42);
    assert.match(stored, /^file:authors\/42\.png:image\/png$/);
    assert.equal(
      fs.existsSync(path.join(tmpRoot, "attachments", "authors", "42.png")),
      true
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fileStorage.setAttachmentsDirAbsolute(null);
  }
});

test("resolveEntityImageUpdate clears old vault file", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "entity-img-"));
  fileStorage.setAttachmentsDirAbsolute(path.join(tmpRoot, "attachments"));

  try {
    const stored = processEntityImageForStorage(PNG_DATA_URL, "sources", 7);
    const cleared = resolveEntityImageUpdate(stored, null, "sources", 7);
    assert.equal(cleared, null);
    assert.equal(
      fs.existsSync(path.join(tmpRoot, "attachments", "sources", "7.png")),
      false
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fileStorage.setAttachmentsDirAbsolute(null);
  }
});
