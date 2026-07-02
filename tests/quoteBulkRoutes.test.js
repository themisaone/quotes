const assert = require("node:assert/strict");
const test = require("node:test");

const { registerQuoteBulkRoutes } = require("../src/routes/quoteBulk");

const silentLogger = {
  error() {},
};

function makeRouteCollector(options) {
  const routes = new Map();
  const app = {
    post(routePath, handler) {
      routes.set(`POST ${routePath}`, handler);
    },
  };

  registerQuoteBulkRoutes(app, {
    logger: silentLogger,
    ...options,
  });
  return routes;
}

async function invoke(routes, { routePath, body = {} }) {
  const handler = routes.get(`POST ${routePath}`);
  assert.equal(typeof handler, "function", `missing route: POST ${routePath}`);

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

  await handler({ body }, res);
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
  const fileStorage = {
    calls: [],
    copyAttachmentFile(value, oldKey, newKey) {
      this.calls.push(["copyAttachmentFile", value, oldKey, newKey]);
      return value ? `${value}:${newKey}` : value;
    },
    deleteAttachment(value) {
      this.calls.push(["deleteAttachment", value]);
    },
  };

  return {
    calls,
    fileStorage,
    getAllowedTypes: () => ["quote", "note"],
    pool: {
      async query(sql, params = []) {
        calls.push({ sql, params });
        return { rows: [] };
      },
    },
    ...overrides,
  };
}

test("registerQuoteBulkRoutes registers all bulk endpoints", () => {
  const routes = makeRouteCollector(makeBaseOptions());

  for (const routePath of [
    "/api/quotes/ids",
    "/api/quotes/bulk-count",
    "/api/quotes/bulk-tag",
    "/api/quotes/bulk-set-group",
    "/api/quotes/bulk-set-subtype",
    "/api/quotes/bulk-untag",
    "/api/quotes/bulk-duplicate",
    "/api/quotes/bulk-split",
    "/api/quotes/bulk-delete",
  ]) {
    assert.equal(typeof routes.get(`POST ${routePath}`), "function", routePath);
  }
});

test("POST /api/quotes/ids uses current allowed types at request time", async () => {
  const options = makeBaseOptions();
  let allowedTypes = ["quote"];
  options.getAllowedTypes = () => allowedTypes;
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return { rows: [{ id: 7 }, { id: 9 }] };
    },
  };
  const routes = makeRouteCollector(options);

  allowedTypes = ["training"];
  const response = await invoke(routes, {
    routePath: "/api/quotes/ids",
    body: { filters: { search: "focus" } },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ids: [7, 9] });
  assert.match(options.calls[0].sql, /^SELECT q\.id FROM notes q/);
  assert.deepEqual(options.calls[0].params, [["training"], "%focus%"]);
});

test("POST /api/quotes/bulk-count counts explicit note IDs from notes", async () => {
  const options = makeBaseOptions();
  options.pool = {
    async query(sql, params = []) {
      options.calls.push({ sql, params });
      return { rows: [{ count: "2" }] };
    },
  };
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/bulk-count",
    body: { noteIds: ["1", "bad", "3"] },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { count: 2 });
  assert.equal(options.calls[0].sql, "SELECT COUNT(*) as count FROM notes WHERE id = ANY($1::int[])");
  assert.deepEqual(options.calls[0].params, [[1, 3]]);
});

test("POST /api/quotes/bulk-tag rolls back validation failures", async () => {
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
    routePath: "/api/quotes/bulk-tag",
    body: { tagName: " " },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Tag name is required" });
  assert.deepEqual(client.calls.map((call) => call.sql), ["BEGIN", "ROLLBACK"]);
  assert.equal(client.released, true);
});

test("POST /api/quotes/bulk-set-group resolves filtered IDs and commits", async () => {
  const client = makeClient((sql) => {
    if (/^SELECT q\.id FROM notes q/.test(sql)) {
      return { rows: [{ id: 11 }, { id: 12 }] };
    }
    return { rows: [], rowCount: 2 };
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
    routePath: "/api/quotes/bulk-set-group",
    body: { filters: { note_type: "note" }, groupName: "group-a" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { count: 2, message: "Set group on 2 notes" });
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT q.id FROM notes q WHERE 1=1 AND q.note_type = $1",
    "UPDATE notes SET translation_group = $1 WHERE id = ANY($2::int[])",
    "COMMIT",
  ]);
  assert.deepEqual(client.calls[1].params, ["note"]);
  assert.deepEqual(client.calls[2].params, ["group-a", [11, 12]]);
  assert.equal(client.released, true);
});

test("POST /api/quotes/bulk-untag rolls back when the tag is missing", async () => {
  const client = makeClient((sql) => {
    if (/SELECT id FROM tags/.test(sql)) return { rows: [] };
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
    routePath: "/api/quotes/bulk-untag",
    body: { noteIds: [3], tagName: "old", noteType: "note" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { count: 0, message: 'Tag "old" not found for type "note"' });
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT id FROM tags WHERE name = $1 AND type = $2",
    "ROLLBACK",
  ]);
  assert.deepEqual(client.calls[1].params, ["old", "note"]);
  assert.equal(client.released, true);
});

test("POST /api/quotes/bulk-delete excludes notes and deletes attachment files", async () => {
  const events = [];
  const client = makeClient((sql) => {
    events.push(sql);
    if (/SELECT id, thumbnail, attachment_full FROM notes/.test(sql)) {
      return {
        rows: [
          { id: 1, thumbnail: "thumb-1", attachment_full: "full-1" },
          { id: 2, thumbnail: "thumb-2", attachment_full: "full-2" },
        ],
      };
    }
    if (/DELETE FROM notes/.test(sql)) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const options = makeBaseOptions({
    fileStorage: {
      calls: [],
      copyAttachmentFile(value, oldKey, newKey) {
        this.calls.push(["copyAttachmentFile", value, oldKey, newKey]);
        return value ? `${value}:${newKey}` : value;
      },
      deleteAttachment(value) {
        this.calls.push(["deleteAttachment", value]);
        events.push(`delete:${value}`);
      },
    },
    pool: {
      async connect() {
        return client;
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/bulk-delete",
    body: { noteIds: [1, 2], excludeIds: [2] },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { count: 1, message: "Deleted 1 notes" });
  assert.deepEqual(options.fileStorage.calls, [
    ["deleteAttachment", "thumb-1"],
    ["deleteAttachment", "full-1"],
  ]);
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT id, thumbnail, attachment_full FROM notes WHERE id = ANY($1::int[])",
    "SELECT thumbnail, attachment_full\n         FROM note_attachments\n         WHERE note_id = ANY($1::int[])",
    "DELETE FROM notes WHERE id = ANY($1)",
    "COMMIT",
  ]);
  assert.deepEqual(client.calls[2].params, [[1]]);
  assert.deepEqual(client.calls[3].params, [[1]]);
  assert.deepEqual(events, [
    "BEGIN",
    "SELECT id, thumbnail, attachment_full FROM notes WHERE id = ANY($1::int[])",
    "SELECT thumbnail, attachment_full\n         FROM note_attachments\n         WHERE note_id = ANY($1::int[])",
    "DELETE FROM notes WHERE id = ANY($1)",
    "COMMIT",
    "delete:thumb-1",
    "delete:full-1",
  ]);
  assert.equal(client.released, true);
});

test("POST /api/quotes/bulk-delete does not delete files when the DB delete rolls back", async () => {
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (/SELECT id, thumbnail, attachment_full FROM notes/.test(sql)) {
      return {
        rows: [
          { id: 1, thumbnail: "thumb-1", attachment_full: "full-1" },
        ],
      };
    }
    if (/DELETE FROM notes/.test(sql)) {
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
    routePath: "/api/quotes/bulk-delete",
    body: { noteIds: [1] },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Failed to delete notes" });
  assert.deepEqual(options.fileStorage.calls, []);
  assert.deepEqual(client.calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT id, thumbnail, attachment_full FROM notes WHERE id = ANY($1::int[])",
    "SELECT thumbnail, attachment_full\n         FROM note_attachments\n         WHERE note_id = ANY($1::int[])",
    "DELETE FROM notes WHERE id = ANY($1)",
    "ROLLBACK",
  ]);
  assert.equal(client.released, true);
});

test("POST /api/quotes/bulk-duplicate copies flat attachments, extra attachments, and tags", async () => {
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
    if (/SELECT note_text, note_format, note_title/.test(sql)) {
      return {
        rows: [
          {
            note_text: "text",
            note_title: "title",
            author_id: 2,
            source_id: 3,
            type: "BOOK",
            score: 4,
            thumbnail: "thumb-old",
            attachment_full: "full-old",
            attachment_type: "image",
            attachment_filename: "main.jpg",
            comment: "comment",
            translation_group: "group",
            note_type: "quote",
            note_date: "2026-06-24",
          },
        ],
      };
    }
    if (/INSERT INTO notes/.test(sql)) return { rows: [{ id: 110 }], rowCount: 1 };
    if (/SELECT \* FROM note_attachments/.test(sql)) {
      return {
        rows: [
          {
            id: 1,
            position: 0,
            thumbnail: "thumb-old",
            attachment_full: "full-old",
            attachment_type: "image",
            storage_type: "file",
            filename: "main.jpg",
          },
          {
            id: 2,
            position: 1,
            thumbnail: "extra-thumb",
            attachment_full: "extra-full",
            attachment_type: "pdf",
            storage_type: "file",
            filename: "extra.pdf",
          },
        ],
      };
    }
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
    routePath: "/api/quotes/bulk-duplicate",
    body: { noteIds: [10] },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { count: 1, message: "Duplicated 1 note" });
  assert.deepEqual(options.fileStorage.calls, [
    ["copyAttachmentFile", "thumb-old", 10, 110],
    ["copyAttachmentFile", "full-old", 10, 110],
    ["copyAttachmentFile", "extra-thumb", "10_a1", "110_a1"],
    ["copyAttachmentFile", "extra-full", "10_a1", "110_a1"],
  ]);

  const noteUpdate = client.calls.find((call) => call.sql === "UPDATE notes SET thumbnail = $1, attachment_full = $2 WHERE id = $3");
  assert.deepEqual(noteUpdate.params, ["thumb-old:110", "full-old:110", 110]);

  const attachmentInserts = client.calls.filter((call) => /INSERT INTO note_attachments/.test(call.sql));
  assert.deepEqual(attachmentInserts.map((call) => call.params), [
    [110, 0, "thumb-old:110", "full-old:110", "image", "file", "main.jpg"],
    [110, 1, "extra-thumb:110_a1", "extra-full:110_a1", "pdf", "file", "extra.pdf"],
  ]);

  const tagCopy = client.calls.find((call) => /INSERT INTO note_tags/.test(call.sql));
  assert.deepEqual(tagCopy.params, [110, 10]);
  assert.equal(client.calls.at(-1).sql, "COMMIT");
  assert.equal(client.released, true);
});

test("POST /api/quotes/bulk-split creates notes for extra attachments and cleans originals", async () => {
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
    if (/SELECT note_text, note_format, note_title/.test(sql)) {
      return {
        rows: [
          {
            note_text: "text",
            note_title: "title",
            author_id: 2,
            source_id: 3,
            type: "BOOK",
            score: 4,
            comment: "comment",
            translation_group: "group",
            note_type: "quote",
            note_date: "2026-06-24",
          },
        ],
      };
    }
    if (/SELECT \* FROM note_attachments/.test(sql)) {
      return {
        rows: [
          {
            id: 500,
            position: 0,
            thumbnail: "main-thumb",
            attachment_full: "main-full",
            attachment_type: "image",
            storage_type: "file",
            filename: "main.jpg",
          },
          {
            id: 501,
            position: 1,
            thumbnail: "extra-thumb",
            attachment_full: "extra-full",
            attachment_type: "pdf",
            storage_type: "file",
            filename: "extra.pdf",
          },
        ],
      };
    }
    if (/INSERT INTO notes/.test(sql)) return { rows: [{ id: 220 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const fileStorage = {
    calls: [],
    copyAttachmentFile(value, oldKey, newKey) {
      this.calls.push(["copyAttachmentFile", value, oldKey, newKey]);
      if (oldKey === "20_a1") return value;
      return `${value}:legacy:${newKey}`;
    },
    deleteAttachment(value) {
      this.calls.push(["deleteAttachment", value]);
    },
  };
  const options = makeBaseOptions({
    fileStorage,
    pool: {
      async connect() {
        return client;
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/quotes/bulk-split",
    body: { noteIds: [20] },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    splitCount: 1,
    newNotes: 1,
    message: "Split 1 note → created 1 new note",
  });
  assert.deepEqual(fileStorage.calls, [
    ["copyAttachmentFile", "extra-full", "20_a1", "220"],
    ["copyAttachmentFile", "extra-full", "20_1", "220"],
    ["deleteAttachment", "extra-thumb"],
    ["deleteAttachment", "extra-full"],
  ]);

  const newNoteAttachmentUpdate = client.calls.find((call) => (
    call.sql === "UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4"
    && call.params[3] === 220
  ));
  assert.deepEqual(newNoteAttachmentUpdate.params, ["extra-thumb", "extra-full:legacy:220", "pdf", 220]);

  const attachmentInsert = client.calls.find((call) => /INSERT INTO note_attachments/.test(call.sql));
  assert.deepEqual(attachmentInsert.params, [220, "extra-thumb", "extra-full:legacy:220", "pdf", "file", "extra.pdf"]);

  const tagCopy = client.calls.find((call) => /INSERT INTO note_tags/.test(call.sql));
  assert.deepEqual(tagCopy.params, [220, 20]);

  const deletedAttachmentRow = client.calls.find((call) => call.sql === "DELETE FROM note_attachments WHERE id = $1");
  assert.deepEqual(deletedAttachmentRow.params, [501]);

  const originalAttachmentUpdate = client.calls.find((call) => (
    call.sql === "UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4"
    && call.params[3] === 20
  ));
  assert.deepEqual(originalAttachmentUpdate.params, ["main-thumb", "main-full", "image", 20]);
  assert.equal(client.calls.at(-1).sql, "COMMIT");
  assert.equal(client.released, true);
});

test("POST /api/quotes/bulk-duplicate deletes copied files when the transaction rolls back", async () => {
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (/SELECT note_text, note_format, note_title/.test(sql)) {
      return {
        rows: [
          {
            note_text: "text",
            note_title: "title",
            author_id: 2,
            source_id: 3,
            type: "BOOK",
            score: 4,
            thumbnail: "thumb-old",
            attachment_full: "full-old",
            attachment_type: "image",
            attachment_filename: "main.jpg",
            comment: "comment",
            translation_group: "group",
            note_type: "quote",
            note_date: "2026-06-24",
          },
        ],
      };
    }
    if (/INSERT INTO notes/.test(sql)) return { rows: [{ id: 110 }], rowCount: 1 };
    if (/SELECT \* FROM note_attachments/.test(sql)) {
      return {
        rows: [
          {
            id: 1,
            position: 0,
            thumbnail: "thumb-old",
            attachment_full: "full-old",
            attachment_type: "image",
            storage_type: "file",
            filename: "main.jpg",
          },
          {
            id: 2,
            position: 1,
            thumbnail: "extra-thumb",
            attachment_full: "extra-full",
            attachment_type: "pdf",
            storage_type: "file",
            filename: "extra.pdf",
          },
        ],
      };
    }
    if (/INSERT INTO note_tags/.test(sql)) throw new Error("tag copy failed");
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
    routePath: "/api/quotes/bulk-duplicate",
    body: { noteIds: [10] },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Failed to duplicate notes" });
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.deepEqual(options.fileStorage.calls.filter((call) => call[0] === "deleteAttachment"), [
    ["deleteAttachment", "thumb-old:110"],
    ["deleteAttachment", "full-old:110"],
    ["deleteAttachment", "extra-thumb:110_a1"],
    ["deleteAttachment", "extra-full:110_a1"],
  ]);
  assert.equal(client.released, true);
});

test("POST /api/quotes/bulk-split deletes copied files on rollback without deleting originals", async () => {
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (/SELECT note_text, note_format, note_title/.test(sql)) {
      return {
        rows: [
          {
            note_text: "text",
            note_title: "title",
            author_id: 2,
            source_id: 3,
            type: "BOOK",
            score: 4,
            comment: "comment",
            translation_group: "group",
            note_type: "quote",
            note_date: "2026-06-24",
          },
        ],
      };
    }
    if (/SELECT \* FROM note_attachments/.test(sql)) {
      return {
        rows: [
          {
            id: 500,
            position: 0,
            thumbnail: "main-thumb",
            attachment_full: "main-full",
            attachment_type: "image",
            storage_type: "file",
            filename: "main.jpg",
          },
          {
            id: 501,
            position: 1,
            thumbnail: "extra-thumb",
            attachment_full: "extra-full",
            attachment_type: "pdf",
            storage_type: "file",
            filename: "extra.pdf",
          },
        ],
      };
    }
    if (/INSERT INTO notes/.test(sql)) return { rows: [{ id: 220 }], rowCount: 1 };
    if (/INSERT INTO note_tags/.test(sql)) throw new Error("tag copy failed");
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
    routePath: "/api/quotes/bulk-split",
    body: { noteIds: [20] },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Failed to split notes" });
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.deepEqual(options.fileStorage.calls, [
    ["copyAttachmentFile", "extra-full", "20_a1", "220"],
    ["deleteAttachment", "extra-full:220"],
  ]);
  assert.equal(client.released, true);
});
