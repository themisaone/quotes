const assert = require("node:assert/strict");
const test = require("node:test");

const { registerQuoteRoutes } = require("../src/routes/quotes");

const silentLogger = {
  error() {},
};

function makeRouteCollector(options) {
  const routes = new Map();
  const app = {
    get(routePath, handler) {
      routes.set(`GET ${routePath}`, handler);
    },
    post(routePath, handler) {
      routes.set(`POST ${routePath}`, handler);
    },
    put(routePath, handler) {
      routes.set(`PUT ${routePath}`, handler);
    },
    delete(routePath, handler) {
      routes.set(`DELETE ${routePath}`, handler);
    },
  };

  registerQuoteRoutes(app, {
    logger: silentLogger,
    ...options,
  });
  return routes;
}

async function invoke(routes, { method = "GET", routePath, query = {}, params = {}, body = {} }) {
  const handler = routes.get(`${method} ${routePath}`);
  assert.equal(typeof handler, "function", `missing route: ${method} ${routePath}`);

  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };

  await handler({ query, params, body }, res);
  return { status: res.statusCode, body: res.body };
}

function makeClient(handler) {
  const calls = [];
  const client = {
    calls,
    released: false,
    async query(sql, params = []) {
      calls.push({ sql, params });
      return handler ? handler(sql, params) : { rows: [], rowCount: 0 };
    },
    release() {
      this.released = true;
    },
  };
  return client;
}

function makeBaseOptions(overrides = {}) {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };

  return {
    calls,
    pool,
    fileStorage: {
      calls: [],
      isFilePath(value) {
        return typeof value === "string" && value.startsWith("file:");
      },
      finalizeUploadedFile(value) {
        return value;
      },
      processForStorage(value) {
        return value || null;
      },
      deleteAttachment(value) {
        this.calls.push(["deleteAttachment", value]);
      },
    },
    getAllowedTypes: () => ["quote", "note"],
    getModeName: () => "DEFAULT",
    async getAttachmentsForNotes() {
      return new Map();
    },
    applyAttachments(note, attachments) {
      return { ...note, attachments: attachments || [] };
    },
    retrieveQuoteImages(note) {
      return { ...note, thumbnail: note.thumbnail ? `resolved:${note.thumbnail}` : note.thumbnail };
    },
    async checkTagTablesExist() {
      return false;
    },
    async getTagsForNote() {
      return [];
    },
    async getTagsForNotes() {
      return new Map();
    },
    ...overrides,
  };
}

test("GET /api/quotes/count returns filtered, type, and grand totals", async () => {
  const options = makeBaseOptions();
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      if (/WHERE note_type = \$1/.test(sql)) return { rows: [{ count: "12" }] };
      if (/SELECT COUNT\(\*\) as count FROM notes$/.test(sql)) return { rows: [{ count: "99" }] };
      return { rows: [{ count: "7" }] };
    },
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/count",
    query: { note_type: "quote", quote: "focus" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    count: 7,
    typeTotal: 12,
    grandTotal: 99,
  });
  assert.match(options.calls[0].sql, /q\.note_type = \$1/);
  assert.deepEqual(options.calls[0].params, ["quote", "%focus%"]);
});

test("GET /api/quotes/count uses current allowed types at request time", async () => {
  const options = makeBaseOptions();
  let allowedTypes = ["quote"];
  options.getAllowedTypes = () => allowedTypes;
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return { rows: [{ count: "0" }] };
    },
  };
  const routes = makeRouteCollector(options);

  allowedTypes = ["training", "note"];
  await invoke(routes, { routePath: "/api/quotes/count" });

  assert.deepEqual(options.calls[0].params, [["training", "note"]]);
});

test("GET /api/quotes/training-years returns parsed years", async () => {
  const options = makeBaseOptions();
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return { rows: [{ year: "2026" }, { year: "2025" }] };
    },
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, { routePath: "/api/quotes/training-years" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { years: [2026, 2025] });
  assert.match(options.calls[0].sql, /q\.note_type = 'training'/);
});

test("GET /api/quotes returns an empty array without enrichment work", async () => {
  let attachmentCalls = 0;
  const options = makeBaseOptions({
    async getAttachmentsForNotes() {
      attachmentCalls++;
      return new Map();
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, { routePath: "/api/quotes" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
  assert.equal(attachmentCalls, 0);
});

test("GET /api/quotes enriches rows with tags and attachments", async () => {
  const options = makeBaseOptions();
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return {
        rows: [
          {
            id: 42,
            note_text: "hello",
            tags: "legacy",
            thumbnail: "thumb",
            attachment_full: "full",
            attachment_type: "image",
          },
        ],
      };
    },
  };
  options.getAttachmentsForNotes = async (noteIds) => {
    assert.deepEqual(noteIds, [42]);
    return new Map([
      [
        42,
        [{ thumbnail: "att-thumb", attachment_full: "att-full", attachment_type: "pdf" }],
      ],
    ]);
  };
  options.checkTagTablesExist = async () => true;
  options.getTagsForNotes = async (noteIds) => {
    assert.deepEqual(noteIds, [42]);
    return new Map([[42, [{ id: 1, name: "tag-a" }, { id: 2, name: "tag-b" }]]]);
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, { routePath: "/api/quotes" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    {
      id: 42,
      note_text: "hello",
      tags: "tag-a, tag-b",
      thumbnail: "resolved:thumb",
      attachment_full: "full",
      attachment_type: "image",
      attachments: [{ thumbnail: "att-thumb", attachment_full: "att-full", attachment_type: "pdf" }],
      tag_objects: [{ id: 1, name: "tag-a" }, { id: 2, name: "tag-b" }],
    },
  ]);
});

test("GET /api/quotes reports query failures", async () => {
  const options = makeBaseOptions({
    pool: {
      async query() {
        throw new Error("db down");
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, { routePath: "/api/quotes" });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Failed to fetch quotes" });
});

test("GET /api/quotes/random rejects note types outside the active mode", async () => {
  const options = makeBaseOptions({
    getAllowedTypes: () => ["quote"],
    getModeName: () => "QUOTES",
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/random",
    query: { note_type: "training" },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: 'Note type "training" is not available in the current mode (QUOTES)',
  });
  assert.equal(options.calls.length, 0);
});

test("GET /api/quotes/random defaults to quote and returns 404 when none exist", async () => {
  const options = makeBaseOptions();
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, { routePath: "/api/quotes/random" });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'No notes of type "quote"' });
  assert.match(options.calls[0].sql, /ORDER BY RANDOM\(\)/);
  assert.deepEqual(options.calls[0].params, ["quote"]);
});

test("GET /api/quotes/random enriches the selected note", async () => {
  const options = makeBaseOptions();
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return {
        rows: [
          {
            id: 77,
            note_text: "random",
            tags: "legacy",
            thumbnail: "thumb",
          },
        ],
      };
    },
  };
  options.getAttachmentsForNotes = async (noteIds) => {
    assert.deepEqual(noteIds, [77]);
    return new Map([[77, [{ thumbnail: "att-thumb", attachment_full: "att-full" }]]]);
  };
  options.checkTagTablesExist = async () => true;
  options.getTagsForNote = async (noteId) => {
    assert.equal(noteId, 77);
    return [{ id: 9, name: "random-tag" }];
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/random",
    query: { note_type: "note" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    id: 77,
    note_text: "random",
    tags: "random-tag",
    thumbnail: "resolved:thumb",
    attachments: [{ thumbnail: "att-thumb", attachment_full: "att-full" }],
    tag_objects: [{ id: 9, name: "random-tag" }],
  });
  assert.deepEqual(options.calls[0].params, ["note"]);
});

test("GET /api/quotes/:id returns 404 when the note is missing", async () => {
  const options = makeBaseOptions();
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/:id",
    params: { id: "123" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Quote not found" });
  assert.match(options.calls[0].sql, /WHERE q\.id = \$1/);
  assert.deepEqual(options.calls[0].params, ["123"]);
});

test("GET /api/quotes/:id enriches the note with legacy tags when tag tables are absent", async () => {
  const options = makeBaseOptions();
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return {
        rows: [
          {
            id: 123,
            note_text: "by-id",
            tags: "legacy",
            thumbnail: "thumb",
          },
        ],
      };
    },
  };
  options.getAttachmentsForNotes = async (noteIds) => {
    assert.deepEqual(noteIds, [123]);
    return new Map([[123, [{ thumbnail: "att-thumb" }]]]);
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/:id",
    params: { id: "123" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    id: 123,
    note_text: "by-id",
    tags: "legacy",
    thumbnail: "resolved:thumb",
    attachments: [{ thumbnail: "att-thumb" }],
  });
});

test("GET /api/quotes/:id/translations returns 404 when the note is missing", async () => {
  const options = makeBaseOptions();
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/:id/translations",
    params: { id: "123" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Quote not found" });
  assert.deepEqual(options.calls[0].params, ["123"]);
});

test("GET /api/quotes/:id/translations returns an empty list without a group", async () => {
  const options = makeBaseOptions();
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return { rows: [{ translation_group: null, language: "en" }] };
    },
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/:id/translations",
    params: { id: "123" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
  assert.equal(options.calls.length, 1);
});

test("GET /api/quotes/:id/translations returns notes in the same group", async () => {
  const options = makeBaseOptions();
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      if (/SELECT translation_group/.test(sql)) {
        return { rows: [{ translation_group: "grp-a", language: "en" }] };
      }
      return {
        rows: [
          {
            id: 124,
            note_text: "Bonjour",
            language: "fr",
            type: "BOOK",
            author_name: "Author",
            source_name: "Source",
          },
        ],
      };
    },
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/:id/translations",
    params: { id: "123" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    {
      id: 124,
      note_text: "Bonjour",
      language: "fr",
      type: "BOOK",
      author_name: "Author",
      source_name: "Source",
    },
  ]);
  assert.deepEqual(options.calls[1].params, ["grp-a", "123"]);
});

test("POST /api/quotes rolls back validation failures", async () => {
  const client = makeClient();
  const options = makeBaseOptions({
    pool: {
      async connect() {
        return client;
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/quotes",
    body: {},
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Please provide at least some text, a title, or an attachment.",
  });
  assert.deepEqual(client.calls.map((call) => call.sql), ["BEGIN", "ROLLBACK"]);
  assert.equal(client.released, true);
});

test("POST /api/quotes creates a note and returns enriched response", async () => {
  const client = makeClient((sql) => {
    if (/INSERT INTO notes/.test(sql)) return { rows: [{ id: 101 }] };
    return { rows: [], rowCount: 1 };
  });
  const options = makeBaseOptions();
  options.pool = {
    async connect() {
      return client;
    },
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return {
        rows: [
          {
            id: 101,
            note_text: "hello",
            tags: "",
            thumbnail: null,
            attachment_full: null,
            attachment_type: "thumbnail",
          },
        ],
      };
    },
  };
  options.getTagsForNote = async (noteId) => {
    assert.equal(noteId, 101);
    return [{ id: 3, name: "created" }];
  };
  options.getAttachmentsForNotes = async (noteIds) => {
    assert.deepEqual(noteIds, [101]);
    return new Map();
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/quotes",
    body: { note_text: "hello" },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    id: 101,
    note_text: "hello",
    tags: "created",
    thumbnail: null,
    attachment_full: null,
    attachment_type: "thumbnail",
    attachments: [],
    tag_objects: [{ id: 3, name: "created" }],
  });
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    `INSERT INTO notes (note_text, note_format, note_title, author_id, source_id, comment, type, score, note_type, note_date, translation_group) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
       RETURNING *`,
    "UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4",
    "COMMIT",
  ]);
  assert.equal(client.released, true);
});

test("POST /api/quotes deletes newly stored attachment files when creation rolls back", async () => {
  const client = makeClient((sql) => {
    if (/INSERT INTO notes/.test(sql)) return { rows: [{ id: 101 }] };
    if (/INSERT INTO note_attachments/.test(sql)) throw new Error("attachment insert failed");
    return { rows: [], rowCount: 1 };
  });
  const fileStorage = {
    calls: [],
    isFilePath(value) {
      return typeof value === "string" && value.startsWith("file:");
    },
    finalizeUploadedFile(value) {
      return value;
    },
    processForStorage(value, folder, noteId, suffix, threshold, forceExternal) {
      const kind = forceExternal ? "full" : "thumb";
      return `file:${folder}/${noteId}-${kind}.bin:application/octet-stream`;
    },
    deleteAttachment(value) {
      this.calls.push(["deleteAttachment", value]);
    },
  };
  const options = makeBaseOptions({ fileStorage });
  options.pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/quotes",
    body: {
      note_text: "hello",
      thumbnail: "data:image/png;base64,aaa",
      attachment_full: "data:application/pdf;base64,bbb",
    },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Failed to create quote" });
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.deepEqual(fileStorage.calls, [
    ["deleteAttachment", "file:quote/101-thumb.bin:application/octet-stream"],
    ["deleteAttachment", "file:quote/101-full.bin:application/octet-stream"],
  ]);
});

test("PUT /api/quotes/:id rolls back when the update target is missing", async () => {
  const client = makeClient((sql) => {
    if (/SELECT thumbnail/.test(sql)) {
      return { rows: [{ thumbnail: null, attachment_full: null, note_type: "historical" }] };
    }
    if (/UPDATE notes SET/.test(sql)) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });
  const options = makeBaseOptions({
    pool: {
      async connect() {
        return client;
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/quotes/:id",
    params: { id: "55" },
    body: { note_text: "updated" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Quote not found" });
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT thumbnail, attachment_full, note_type FROM notes WHERE id = $1",
    "UPDATE notes SET note_text = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
    "ROLLBACK",
  ]);
  assert.equal(client.released, true);
});

test("PUT /api/quotes/:id deletes newly stored attachments when update target disappears", async () => {
  const client = makeClient((sql) => {
    if (/SELECT thumbnail/.test(sql)) {
      return {
        rows: [{ thumbnail: "old-thumb", attachment_full: "old-full", note_type: "historical" }],
      };
    }
    if (/UPDATE notes SET/.test(sql)) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });
  const fileStorage = {
    calls: [],
    isFilePath(value) {
      return typeof value === "string" && value.startsWith("file:");
    },
    finalizeUploadedFile(value) {
      return value;
    },
    processForStorage(value, folder, noteId, suffix, threshold, forceExternal) {
      const kind = forceExternal ? "full" : "thumb";
      return `file:${folder}/${noteId}-${kind}.bin:application/octet-stream`;
    },
    deleteAttachment(value) {
      this.calls.push(["deleteAttachment", value]);
    },
  };
  const options = makeBaseOptions({ fileStorage });
  options.pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/quotes/:id",
    params: { id: "55" },
    body: { thumbnail: "data:image/png;base64,aaa" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Quote not found" });
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.deepEqual(fileStorage.calls, [
    ["deleteAttachment", "file:historical/55-thumb.bin:application/octet-stream"],
  ]);
});

test("PUT /api/quotes/:id clears attachment files and syncs the primary row", async () => {
  const client = makeClient((sql) => {
    if (/SELECT thumbnail/.test(sql)) {
      return {
        rows: [
          {
            thumbnail: "old-thumb",
            attachment_full: "old-full",
            note_type: "historical",
          },
        ],
      };
    }
    if (/UPDATE notes SET/.test(sql)) return { rows: [{ id: 55 }], rowCount: 1 };
    if (/SELECT id FROM note_attachments/.test(sql)) return { rows: [{ id: 9 }] };
    return { rows: [], rowCount: 1 };
  });
  const fileStorage = {
    calls: [],
    isFilePath(value) {
      return typeof value === "string" && value.startsWith("file:");
    },
    finalizeUploadedFile(value) {
      return value;
    },
    processForStorage(value) {
      return value || null;
    },
    deleteAttachment(value) {
      this.calls.push(["deleteAttachment", value]);
    },
  };
  const options = makeBaseOptions({ fileStorage });
  options.pool = {
    async connect() {
      return client;
    },
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return {
        rows: [
          {
            id: 55,
            tags: "legacy",
            thumbnail: null,
            attachment_full: null,
            attachment_type: "image",
          },
        ],
      };
    },
  };
  options.getAttachmentsForNotes = async (noteIds) => {
    assert.deepEqual(noteIds, [55]);
    return new Map();
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/quotes/:id",
    params: { id: "55" },
    body: { thumbnail: "", attachment_full: "", attachment_type: "image" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(fileStorage.calls, [
    ["deleteAttachment", "old-thumb"],
    ["deleteAttachment", "old-full"],
  ]);
  assert.ok(client.calls.some((call) => /UPDATE note_attachments SET/.test(call.sql)));
  assert.equal(client.calls.at(-1).sql, "COMMIT");
  assert.deepEqual(response.body, {
    id: 55,
    tags: "legacy",
    thumbnail: null,
    attachment_full: null,
    attachment_type: "image",
    attachments: [],
    tag_objects: [],
  });
});

test("PUT /api/quotes/:id keeps old attachment files when a later update step rolls back", async () => {
  const client = makeClient((sql) => {
    if (/SELECT thumbnail/.test(sql)) {
      return {
        rows: [
          {
            thumbnail: "old-thumb",
            attachment_full: "old-full",
            note_type: "historical",
          },
        ],
      };
    }
    if (/UPDATE notes SET/.test(sql)) return { rows: [{ id: 55 }], rowCount: 1 };
    if (/SELECT id FROM note_attachments/.test(sql)) return { rows: [{ id: 9 }] };
    if (/UPDATE note_attachments SET/.test(sql)) throw new Error("attachment sync failed");
    return { rows: [], rowCount: 1 };
  });
  const fileStorage = {
    calls: [],
    isFilePath(value) {
      return typeof value === "string" && value.startsWith("file:");
    },
    finalizeUploadedFile(value) {
      return value;
    },
    processForStorage(value) {
      return value || null;
    },
    deleteAttachment(value) {
      this.calls.push(["deleteAttachment", value]);
    },
  };
  const options = makeBaseOptions({ fileStorage });
  options.pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/quotes/:id",
    params: { id: "55" },
    body: { thumbnail: "", attachment_full: "", attachment_type: "image" },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Failed to update quote" });
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.deepEqual(fileStorage.calls, []);
});

test("DELETE /api/quotes/:id rolls back when the note is missing", async () => {
  const client = makeClient((sql) => {
    if (/SELECT thumbnail, attachment_full FROM notes/.test(sql)) return { rows: [] };
    return { rows: [], rowCount: 0 };
  });
  const options = makeBaseOptions({
    pool: {
      async connect() {
        return client;
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/quotes/:id",
    params: { id: "55" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Quote not found" });
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT thumbnail, attachment_full FROM notes WHERE id = $1",
    "ROLLBACK",
  ]);
  assert.equal(options.fileStorage.calls.length, 0);
  assert.equal(client.released, true);
});

test("DELETE /api/quotes/:id deletes flat and attachment-row files only after commit", async () => {
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
    if (/SELECT thumbnail, attachment_full FROM notes/.test(sql)) {
      return { rows: [{ thumbnail: "flat-thumb", attachment_full: "shared-full" }] };
    }
    if (/FROM note_attachments/.test(sql)) {
      return {
        rows: [
          { thumbnail: "att-thumb", attachment_full: "shared-full" },
          { thumbnail: null, attachment_full: "att-full-2" },
        ],
      };
    }
    if (/DELETE FROM notes WHERE id = \$1 RETURNING/.test(sql)) {
      return { rows: [{ id: 55, note_text: "deleted" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const fileStorage = {
    calls: [],
    deleteAttachment(value) {
      assert.equal(client.calls.at(-1).sql, "COMMIT");
      this.calls.push(["deleteAttachment", value]);
    },
  };
  const options = makeBaseOptions({ fileStorage });
  options.pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/quotes/:id",
    params: { id: "55" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    message: "Quote deleted successfully",
    quote: { id: 55, note_text: "deleted" },
  });
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT thumbnail, attachment_full FROM notes WHERE id = $1",
    `SELECT thumbnail, attachment_full
         FROM note_attachments
         WHERE note_id = $1`,
    "DELETE FROM notes WHERE id = $1 RETURNING *",
    "COMMIT",
  ]);
  assert.deepEqual(fileStorage.calls, [
    ["deleteAttachment", "flat-thumb"],
    ["deleteAttachment", "shared-full"],
    ["deleteAttachment", "att-thumb"],
    ["deleteAttachment", "att-full-2"],
  ]);
  assert.equal(client.released, true);
});

test("DELETE /api/quotes/:id keeps files when the delete rolls back", async () => {
  const client = makeClient((sql) => {
    if (/SELECT thumbnail, attachment_full FROM notes/.test(sql)) {
      return { rows: [{ thumbnail: "flat-thumb", attachment_full: "flat-full" }] };
    }
    if (/FROM note_attachments/.test(sql)) {
      return { rows: [{ thumbnail: "att-thumb", attachment_full: "att-full" }] };
    }
    if (/DELETE FROM notes WHERE id = \$1 RETURNING/.test(sql)) {
      throw new Error("delete failed");
    }
    return { rows: [], rowCount: 0 };
  });
  const options = makeBaseOptions({
    pool: {
      async connect() {
        return client;
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/quotes/:id",
    params: { id: "55" },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Failed to delete quote" });
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.deepEqual(options.fileStorage.calls, []);
  assert.equal(client.released, true);
});

test("POST /api/notes/merge rolls back validation failures", async () => {
  const client = makeClient();
  const options = makeBaseOptions({
    pool: {
      async connect() {
        return client;
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/notes/merge",
    body: { mainNoteId: 1, otherNoteIds: [] },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "mainNoteId and otherNoteIds required" });
  assert.deepEqual(client.calls.map((call) => call.sql), ["BEGIN", "ROLLBACK"]);
  assert.equal(client.released, true);
});

test("POST /api/notes/merge rejects self-merges before touching notes", async () => {
  const client = makeClient();
  const options = makeBaseOptions({
    pool: {
      async connect() {
        return client;
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/notes/merge",
    body: { mainNoteId: 1, otherNoteIds: [1, 2] },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Cannot merge a note into itself" });
  assert.deepEqual(client.calls.map((call) => call.sql), ["BEGIN", "ROLLBACK"]);
  assert.equal(client.released, true);
});

test("POST /api/notes/merge rolls back when the main note is missing", async () => {
  const client = makeClient((sql) => {
    if (/SELECT \* FROM notes WHERE id = \$1/.test(sql)) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });
  const options = makeBaseOptions({
    pool: {
      async connect() {
        return client;
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/notes/merge",
    body: { mainNoteId: 1, otherNoteIds: [2] },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Main note not found" });
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT * FROM notes WHERE id = $1",
    "ROLLBACK",
  ]);
  assert.equal(client.released, true);
});

test("POST /api/notes/merge moves content and returns enriched main note", async () => {
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
    if (/SELECT \* FROM notes WHERE id = \$1/.test(sql)) {
      return { rows: [{ id: 1, note_text: "main" }] };
    }
    if (/COALESCE\(MAX\(position\), -1\)/.test(sql)) {
      return { rows: [{ n: 0 }] };
    }
    if (/SELECT \* FROM note_attachments WHERE note_id = \$1 ORDER BY position$/.test(sql)) {
      return { rows: [{ id: 10, thumbnail: "other-thumb", attachment_full: "other-full", attachment_type: "image" }] };
    }
    if (/SELECT id, note_text, note_format, comment FROM notes/.test(sql)) {
      return { rows: [{ id: 2, note_text: "other", comment: "src" }] };
    }
    if (/SELECT DISTINCT tag_id/.test(sql)) {
      return { rows: [{ tag_id: 5 }] };
    }
    if (/ORDER BY position LIMIT 1/.test(sql)) {
      return { rows: [{ thumbnail: "primary-thumb", attachment_full: "primary-full", attachment_type: "pdf" }] };
    }
    return { rows: [], rowCount: 1 };
  });
  const options = makeBaseOptions();
  options.pool = {
    async connect() {
      return client;
    },
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return {
        rows: [
          {
            id: 1,
            note_text: "merged",
            tags: "",
            thumbnail: "primary-thumb",
            attachment_full: "primary-full",
            attachment_type: "pdf",
          },
        ],
      };
    },
  };
  options.getTagsForNote = async (noteId) => {
    assert.equal(noteId, 1);
    return [{ id: 5, name: "merged-tag" }];
  };
  options.getAttachmentsForNotes = async (noteIds) => {
    assert.deepEqual(noteIds, [1]);
    return new Map([[1, [{ thumbnail: "att-thumb", attachment_full: "att-full", attachment_type: "pdf" }]]]);
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/notes/merge",
    body: { mainNoteId: 1, otherNoteIds: [2], appendTexts: true, mergeTags: true },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    id: 1,
    note_text: "merged",
    tags: "merged-tag",
    thumbnail: "resolved:primary-thumb",
    attachment_full: "primary-full",
    attachment_type: "pdf",
    attachments: [{ thumbnail: "att-thumb", attachment_full: "att-full", attachment_type: "pdf" }],
    tag_objects: [{ id: 5, name: "merged-tag" }],
  });
  assert.ok(client.calls.some((call) => (
    call.sql === "UPDATE note_attachments SET note_id = $1, position = $2 WHERE id = $3"
    && call.params[0] === 1
    && call.params[1] === 0
    && call.params[2] === 10
  )));
  assert.ok(client.calls.some((call) => (
    call.sql === "UPDATE notes SET note_text = $1 WHERE id = $2"
    && call.params[0] === "main<hr><em>src</em>other"
    && call.params[1] === 1
  )));
  assert.ok(client.calls.some((call) => /INSERT INTO note_tags/.test(call.sql)));
  assert.ok(client.calls.some((call) => call.sql === "DELETE FROM notes WHERE id = ANY($1::int[])"));
  assert.ok(client.calls.some((call) => call.sql === "UPDATE notes SET translation_group = NULL WHERE id = $1"));
  assert.ok(client.calls.some((call) => /UPDATE notes SET thumbnail = \$1/.test(call.sql)));
  assert.equal(client.calls.at(-1).sql, "COMMIT");
  assert.equal(client.released, true);
});
