const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getQuoteAttachmentFolder,
  prepareQuoteCreateAttachments,
  prepareQuoteUpdateAttachments,
  buildPrimaryAttachmentUpdate,
  buildPrimaryAttachmentInsert,
} = require("../src/quoteAttachmentSync");

function createFileStorageStub() {
  const calls = [];

  return {
    calls,
    finalizeUploadedFile(value, noteId, suffix) {
      calls.push(["finalizeUploadedFile", value, noteId, suffix]);
      return value.startsWith("tmp:") ? value.replace("tmp:", `final:${noteId}:`) : value;
    },
    isFilePath(value) {
      return typeof value === "string" && value.startsWith("file:");
    },
    processForStorage(value, folder, noteId, suffix, threshold, forceExternal) {
      calls.push([
        "processForStorage",
        value,
        folder,
        noteId,
        suffix,
        threshold,
        forceExternal,
      ]);
      return forceExternal ? `full:${folder}:${value}` : `thumb:${folder}:${value}`;
    },
  };
}

test("getQuoteAttachmentFolder normalizes legacy folder names", () => {
  assert.equal(getQuoteAttachmentFolder(undefined), "quote");
  assert.equal(getQuoteAttachmentFolder("quote"), "quote");
  assert.equal(getQuoteAttachmentFolder("quotes"), "quote");
  assert.equal(getQuoteAttachmentFolder("historical"), "historical");
  assert.throws(() => getQuoteAttachmentFolder("../outside"), /Invalid attachment folder/);
});

test("prepareQuoteCreateAttachments processes thumbnail and full attachment", () => {
  const fileStorage = createFileStorageStub();

  const result = prepareQuoteCreateAttachments({
    noteId: 42,
    thumbnail: "tmp:thumb",
    attachmentFull: "tmp:full",
    attachmentType: "pdf",
    noteType: "quotes",
    storageThresholdMB: 3,
    fileStorage,
  });

  assert.equal(result.processedThumbnail, "thumb:quote:final:42:thumb");
  assert.equal(result.processedAttachmentFull, "full:quote:final:42:full");
  assert.deepEqual(result.updateParams, [
    "thumb:quote:final:42:thumb",
    "full:quote:final:42:full",
    "pdf",
    42,
  ]);
  assert.equal(result.shouldInsertPrimaryAttachment, true);
  assert.deepEqual(result.insertParams, [
    42,
    "thumb:quote:final:42:thumb",
    "full:quote:final:42:full",
    "pdf",
  ]);
  assert.deepEqual(fileStorage.calls, [
    ["finalizeUploadedFile", "tmp:thumb", 42, ""],
    ["processForStorage", "final:42:thumb", "quote", 42, "", 3, false],
    ["finalizeUploadedFile", "tmp:full", 42, ""],
    ["processForStorage", "final:42:full", "quote", 42, "", 3, true],
  ]);
});

test("prepareQuoteCreateAttachments skips empty attachments", () => {
  const fileStorage = createFileStorageStub();

  const result = prepareQuoteCreateAttachments({
    noteId: 9,
    fileStorage,
  });

  assert.equal(result.processedThumbnail, null);
  assert.equal(result.processedAttachmentFull, null);
  assert.deepEqual(result.updateParams, [null, null, "thumbnail", 9]);
  assert.equal(result.shouldInsertPrimaryAttachment, false);
  assert.deepEqual(fileStorage.calls, []);
});

test("prepareQuoteCreateAttachments reports newly stored file refs", () => {
  const storedRefs = [];
  const fileStorage = {
    finalizeUploadedFile(value) {
      return value;
    },
    isFilePath(value) {
      return typeof value === "string" && value.startsWith("file:");
    },
    processForStorage(value, folder, noteId, suffix, threshold, forceExternal) {
      return `file:${folder}/${noteId}-${forceExternal ? "full" : "thumb"}.bin:application/octet-stream`;
    },
  };

  prepareQuoteCreateAttachments({
    noteId: 12,
    thumbnail: "data:image/png;base64,aaa",
    attachmentFull: "data:application/pdf;base64,bbb",
    fileStorage,
    onStoredFile: (ref) => storedRefs.push(ref),
  });

  assert.deepEqual(storedRefs, [
    "file:quote/12-thumb.bin:application/octet-stream",
    "file:quote/12-full.bin:application/octet-stream",
  ]);
});

test("prepareQuoteUpdateAttachments does not report unchanged file refs as new", () => {
  const storedRefs = [];
  const fileStorage = {
    finalizeUploadedFile(value) {
      return value;
    },
    isFilePath(value) {
      return typeof value === "string" && value.startsWith("file:");
    },
    processForStorage(value) {
      return value;
    },
  };

  prepareQuoteUpdateAttachments({
    noteId: 12,
    attachmentFull: "file:quote/12.pdf:application/pdf",
    fileStorage,
    onStoredFile: (ref) => storedRefs.push(ref),
  });

  assert.deepEqual(storedRefs, []);
});

test("prepareQuoteUpdateAttachments only emits provided attachment fields", () => {
  const fileStorage = createFileStorageStub();

  const result = prepareQuoteUpdateAttachments({
    noteId: 7,
    thumbnail: "data:image/png;base64,aGVsbG8=",
    noteType: "historical",
    storageThresholdMB: 2,
    fileStorage,
  });

  assert.deepEqual(result.fields, [
    { column: "thumbnail", value: "thumb:historical:data:image/png;base64,aGVsbG8=" },
  ]);
  assert.equal(result.processedThumbnail, "thumb:historical:data:image/png;base64,aGVsbG8=");
  assert.equal(result.processedAttachmentFull, undefined);
  assert.deepEqual(fileStorage.calls, [
    ["finalizeUploadedFile", "data:image/png;base64,aGVsbG8=", 7, ""],
    [
      "processForStorage",
      "data:image/png;base64,aGVsbG8=",
      "historical",
      7,
      "",
      2,
      false,
    ],
  ]);
});

test("prepareQuoteUpdateAttachments preserves flat clear values and syncs nulls", () => {
  const fileStorage = createFileStorageStub();

  const result = prepareQuoteUpdateAttachments({
    noteId: 7,
    thumbnail: "",
    attachmentFull: null,
    fileStorage,
  });

  assert.deepEqual(result.fields, [
    { column: "thumbnail", value: "" },
    { column: "attachment_full", value: null },
  ]);
  assert.equal(result.processedThumbnail, null);
  assert.equal(result.processedAttachmentFull, null);
  assert.deepEqual(fileStorage.calls, []);
});

test("buildPrimaryAttachmentUpdate creates SQL for provided fields only", () => {
  const query = buildPrimaryAttachmentUpdate({
    noteId: 17,
    thumbnail: null,
    attachmentType: "image",
  });

  assert.deepEqual(query, {
    sql: "UPDATE note_attachments SET thumbnail = $1, attachment_type = $2 WHERE note_id = $3 AND position = 0",
    params: [null, "image", 17],
  });
});

test("buildPrimaryAttachmentInsert returns null without attachment content", () => {
  assert.equal(
    buildPrimaryAttachmentInsert({
      noteId: 17,
      thumbnail: null,
      attachmentFull: undefined,
      attachmentType: "image",
    }),
    null
  );
});

test("buildPrimaryAttachmentInsert defaults missing attachment type to image", () => {
  const query = buildPrimaryAttachmentInsert({
    noteId: 17,
    thumbnail: undefined,
    attachmentFull: "file:quote/17.pdf:application/pdf",
    attachmentType: "",
  });

  assert.deepEqual(query, {
    sql: `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type)
           VALUES ($1, 0, $2, $3, $4, 'base64')`,
    params: [17, null, "file:quote/17.pdf:application/pdf", "image"],
  });
});
