const assert = require("node:assert/strict");
const test = require("node:test");

const {
  formatTagNames,
  enrichNoteResponse,
  enrichSingleNoteResponse,
  enrichNoteListResponse,
} = require("../src/quoteResponse");

function makeDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    retrieveQuoteImages(note) {
      calls.push(["retrieveQuoteImages", note.id]);
      return { ...note, thumbnail: note.thumbnail ? `resolved:${note.thumbnail}` : note.thumbnail };
    },
    applyAttachments(note, attachments) {
      calls.push(["applyAttachments", note.id, attachments || []]);
      return {
        ...note,
        attachments: attachments || [],
        attachment_full: attachments?.[0]?.attachment_full || note.attachment_full,
        attachment_type: attachments?.[0]?.attachment_type || note.attachment_type,
      };
    },
    async getAttachmentsForNotes(noteIds) {
      calls.push(["getAttachmentsForNotes", noteIds]);
      return new Map();
    },
    async checkTagTablesExist() {
      calls.push(["checkTagTablesExist"]);
      return false;
    },
    async getTagsForNote(noteId) {
      calls.push(["getTagsForNote", noteId]);
      return [];
    },
    async getTagsForNotes(noteIds) {
      calls.push(["getTagsForNotes", noteIds]);
      return new Map();
    },
    ...overrides,
  };
}

test("formatTagNames joins tag names in order", () => {
  assert.equal(formatTagNames([{ name: "one" }, { name: "two" }]), "one, two");
});

test("enrichNoteResponse applies images, attachments, and tag fallback", () => {
  const deps = makeDeps();

  const response = enrichNoteResponse(
    { id: 1, tags: "legacy", thumbnail: "thumb", attachment_full: "full" },
    {
      attachments: [{ attachment_full: "att-full", attachment_type: "pdf" }],
      tags: [],
      ...deps,
    }
  );

  assert.deepEqual(response, {
    id: 1,
    tags: "legacy",
    thumbnail: "resolved:thumb",
    attachment_full: "att-full",
    attachment_type: "pdf",
    attachments: [{ attachment_full: "att-full", attachment_type: "pdf" }],
    tag_objects: [],
  });
});

test("enrichSingleNoteResponse omits tag_objects when tag tables are absent", async () => {
  const deps = makeDeps({
    async getAttachmentsForNotes(noteIds) {
      assert.deepEqual(noteIds, [7]);
      return new Map([[7, [{ attachment_full: "att-full" }]]]);
    },
    async checkTagTablesExist() {
      return false;
    },
  });

  const response = await enrichSingleNoteResponse(
    { id: 7, tags: "legacy", thumbnail: "thumb" },
    {
      attachmentNoteId: 7,
      tagNoteId: "7",
      ...deps,
    }
  );

  assert.deepEqual(response, {
    id: 7,
    tags: "legacy",
    thumbnail: "resolved:thumb",
    attachments: [{ attachment_full: "att-full" }],
    attachment_full: "att-full",
    attachment_type: undefined,
  });
  assert.equal("tag_objects" in response, false);
});

test("enrichSingleNoteResponse loads tag objects when tag tables exist", async () => {
  const deps = makeDeps({
    async getAttachmentsForNotes(noteIds) {
      assert.deepEqual(noteIds, [7]);
      return new Map();
    },
    async checkTagTablesExist() {
      return true;
    },
    async getTagsForNote(noteId) {
      assert.equal(noteId, "7");
      return [{ id: 1, name: "new" }];
    },
  });

  const response = await enrichSingleNoteResponse(
    { id: 7, tags: "legacy", thumbnail: null },
    {
      attachmentNoteId: 7,
      tagNoteId: "7",
      ...deps,
    }
  );

  assert.deepEqual(response, {
    id: 7,
    tags: "new",
    thumbnail: null,
    attachments: [],
    attachment_full: undefined,
    attachment_type: undefined,
    tag_objects: [{ id: 1, name: "new" }],
  });
});

test("enrichNoteListResponse enriches all notes with attachment and tag maps", async () => {
  const deps = makeDeps({
    async getAttachmentsForNotes(noteIds) {
      assert.deepEqual(noteIds, [1, 2]);
      return new Map([[2, [{ attachment_full: "two-full" }]]]);
    },
    async checkTagTablesExist() {
      return true;
    },
    async getTagsForNotes(noteIds) {
      assert.deepEqual(noteIds, [1, 2]);
      return new Map([[1, [{ id: 9, name: "one-tag" }]]]);
    },
  });

  const response = await enrichNoteListResponse(
    [
      { id: 1, tags: "legacy-one", thumbnail: "one-thumb" },
      { id: 2, tags: "legacy-two", thumbnail: null },
    ],
    deps
  );

  assert.deepEqual(response, [
    {
      id: 1,
      tags: "one-tag",
      thumbnail: "resolved:one-thumb",
      attachments: [],
      attachment_full: undefined,
      attachment_type: undefined,
      tag_objects: [{ id: 9, name: "one-tag" }],
    },
    {
      id: 2,
      tags: "legacy-two",
      thumbnail: null,
      attachments: [{ attachment_full: "two-full" }],
      attachment_full: "two-full",
      attachment_type: undefined,
      tag_objects: [],
    },
  ]);
});

test("enrichNoteListResponse returns empty array without dependency work", async () => {
  let calls = 0;
  const response = await enrichNoteListResponse([], {
    getAttachmentsForNotes() {
      calls++;
    },
    checkTagTablesExist() {
      calls++;
    },
    getTagsForNotes() {
      calls++;
    },
    retrieveQuoteImages() {
      calls++;
    },
    applyAttachments() {
      calls++;
    },
  });

  assert.deepEqual(response, []);
  assert.equal(calls, 0);
});
