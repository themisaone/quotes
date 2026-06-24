const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getOrCreateQuoteAuthorId,
  getOrCreateQuoteSourceId,
  resolveEffectiveNoteType,
  buildQuoteInsertParams,
  buildQuoteScalarUpdateFields,
  syncQuoteTags,
  propagateTranslationGroupRename,
} = require("../src/quoteMetadata");

function createClient(handler) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      return handler ? handler(sql, params) : { rows: [] };
    },
  };
}

test("getOrCreateQuoteAuthorId trims names and skips blanks", async () => {
  const client = createClient(() => ({ rows: [{ id: 11 }] }));

  assert.equal(await getOrCreateQuoteAuthorId("  Ada Lovelace  ", client), 11);
  assert.equal(await getOrCreateQuoteAuthorId("   ", client), null);
  assert.deepEqual(client.calls[0].params, ["Ada Lovelace"]);
  assert.match(client.calls[0].sql, /INSERT INTO authors/);
});

test("getOrCreateQuoteSourceId uses the requested conflict behavior", async () => {
  const client = createClient(() => ({ rows: [{ id: 22 }] }));

  assert.equal(
    await getOrCreateQuoteSourceId({
      source: "  Book  ",
      sourceType: "BOOK",
      client,
      updateTypeOnConflict: true,
    }),
    22
  );
  assert.equal(
    await getOrCreateQuoteSourceId({
      source: "Film",
      sourceType: "MOVIE",
      client,
      updateTypeOnConflict: false,
    }),
    22
  );

  assert.match(client.calls[0].sql, /DO UPDATE SET type = EXCLUDED\.type/);
  assert.deepEqual(client.calls[0].params, ["Book", "BOOK"]);
  assert.match(client.calls[1].sql, /DO UPDATE SET name = sources\.name/);
  assert.deepEqual(client.calls[1].params, ["Film", "MOVIE"]);
});

test("resolveEffectiveNoteType prefers explicit updates and otherwise keeps existing type", () => {
  assert.equal(
    resolveEffectiveNoteType({ requestedNoteType: "historical", existingNoteType: "note" }),
    "historical"
  );
  assert.equal(
    resolveEffectiveNoteType({ requestedNoteType: undefined, existingNoteType: "note" }),
    "note"
  );
  assert.equal(
    resolveEffectiveNoteType({ requestedNoteType: undefined, existingNoteType: null }),
    "quote"
  );
});

test("buildQuoteInsertParams normalizes title and note text", () => {
  assert.deepEqual(
    buildQuoteInsertParams({
      noteText: "<p><br></p>",
      noteTitle: "",
      authorId: 1,
      sourceId: 2,
      comment: "comment",
      sourceType: "ARTICLE",
      score: 5,
      noteType: "historical",
      noteDate: "2026-06-23",
      translationGroup: "group-1",
    }),
    ["", null, 1, 2, "comment", "ARTICLE", 5, "historical", "2026-06-23", "group-1"]
  );
});

test("buildQuoteScalarUpdateFields emits only provided scalar fields", () => {
  assert.deepEqual(
    buildQuoteScalarUpdateFields({
      noteText: "<en-media />",
      noteTitle: "",
      authorProvided: true,
      authorId: null,
      sourceProvided: true,
      sourceId: 3,
      score: 0,
      attachmentType: "pdf",
      noteType: "note",
    }),
    [
      { column: "note_text", value: "" },
      { column: "note_title", value: null },
      { column: "author_id", value: null },
      { column: "source_id", value: 3 },
      { column: "score", value: 0 },
      { column: "attachment_type", value: "pdf" },
      { column: "note_type", value: "note" },
    ]
  );
});

test("syncQuoteTags associates parsed tags", async () => {
  const client = createClient();
  const calls = [];
  const helpers = {
    parseTagInput(value) {
      calls.push(["parse", value]);
      return ["history", "archive"];
    },
    async getOrCreateTagIds(tagNames, noteType, dbClient) {
      calls.push(["getOrCreate", tagNames, noteType, dbClient === client]);
      return [5, 6];
    },
    async associateTagsWithNote(noteId, tagIds, dbClient) {
      calls.push(["associate", noteId, tagIds, dbClient === client]);
    },
    async checkTagTablesExist() {
      calls.push(["check"]);
      return true;
    },
  };

  const result = await syncQuoteTags({
    noteId: 42,
    tags: "history, archive",
    noteType: "historical",
    client,
    helpers,
  });

  assert.deepEqual(result, {
    action: "associated",
    tagNames: ["history", "archive"],
    tagIds: [5, 6],
  });
  assert.deepEqual(calls, [
    ["parse", "history, archive"],
    ["getOrCreate", ["history", "archive"], "historical", true],
    ["associate", 42, [5, 6], true],
  ]);
});

test("syncQuoteTags clears existing tags when update input has no usable tags", async () => {
  const client = createClient();
  const helpers = {
    parseTagInput() {
      return [];
    },
    async getOrCreateTagIds() {
      throw new Error("should not create tags");
    },
    async associateTagsWithNote() {
      throw new Error("should not associate tags");
    },
    async checkTagTablesExist() {
      return true;
    },
  };

  const result = await syncQuoteTags({
    noteId: 42,
    tags: "",
    noteType: "quote",
    client,
    clearWhenEmpty: true,
    helpers,
  });

  assert.equal(result.action, "cleared");
  assert.deepEqual(client.calls, [
    { sql: "DELETE FROM note_tags WHERE note_id = $1", params: [42] },
  ]);
});

test("propagateTranslationGroupRename updates the old group when it changes", async () => {
  const client = createClient((sql) => {
    if (/SELECT translation_group/.test(sql)) {
      return { rows: [{ translation_group: "old-group" }] };
    }
    return { rows: [] };
  });

  const result = await propagateTranslationGroupRename({
    noteId: 42,
    translationGroup: "new-group",
    client,
  });

  assert.deepEqual(result, { oldTranslationGroup: "old-group", propagated: true });
  assert.deepEqual(client.calls[1].params, ["new-group", "old-group"]);
  assert.match(client.calls[1].sql, /WHERE translation_group = \$2/);
});

test("propagateTranslationGroupRename skips when group is unchanged or missing", async () => {
  const unchangedClient = createClient(() => ({ rows: [{ translation_group: "same" }] }));
  const missingClient = createClient(() => ({ rows: [] }));

  assert.deepEqual(
    await propagateTranslationGroupRename({
      noteId: 42,
      translationGroup: "same",
      client: unchangedClient,
    }),
    { oldTranslationGroup: "same", propagated: false }
  );
  assert.deepEqual(
    await propagateTranslationGroupRename({
      noteId: 43,
      translationGroup: "new",
      client: missingClient,
    }),
    { oldTranslationGroup: null, propagated: false }
  );
  assert.equal(unchangedClient.calls.length, 1);
  assert.equal(missingClient.calls.length, 1);
});
