const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEDUP_GROUPS_SQL,
  DEDUP_NOTES_SQL,
  parseDedupLimit,
  parseDedupOffset,
  registerDedupRoutes,
} = require("../src/routes/dedup");

const silentLogger = {
  error() {},
};

function makeRouteCollector(options) {
  const routes = new Map();
  const app = {
    get(routePath, handler) {
      routes.set(`GET ${routePath}`, handler);
    },
  };

  registerDedupRoutes(app, {
    logger: silentLogger,
    ...options,
  });
  return routes;
}

async function invoke(routes, { routePath, query = {} }) {
  const handler = routes.get(`GET ${routePath}`);
  assert.equal(typeof handler, "function", `missing route: GET ${routePath}`);

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

  await handler({ query }, res);
  return { status: res.statusCode, body: res.body };
}

function makeBaseOptions(overrides = {}) {
  const calls = [];
  const options = {
    calls,
    pool: {
      async query(sql, params = []) {
        calls.push({ sql, params });
        return { rows: [] };
      },
    },
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
    async getTagsForNotes() {
      return new Map();
    },
    ...overrides,
  };
  return options;
}

test("parseDedupLimit and parseDedupOffset clamp request values", () => {
  assert.equal(parseDedupLimit("0"), 40);
  assert.equal(parseDedupLimit("-5"), 1);
  assert.equal(parseDedupLimit("5"), 5);
  assert.equal(parseDedupLimit("500"), 100);
  assert.equal(parseDedupOffset("-1"), 0);
  assert.equal(parseDedupOffset("17"), 17);
});

test("registerDedupRoutes registers duplicate suspect endpoint", () => {
  const routes = makeRouteCollector(makeBaseOptions());

  assert.equal(typeof routes.get("GET /api/dedup/suspects"), "function");
});

test("GET /api/dedup/suspects returns empty groups without loading notes", async () => {
  const options = makeBaseOptions();
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/dedup/suspects",
    query: { limit: "500", offset: "-10" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { groups: [], limit: 100, offset: 0 });
  assert.equal(options.calls.length, 1);
  assert.equal(options.calls[0].sql, DEDUP_GROUPS_SQL);
  assert.deepEqual(options.calls[0].params, [100, 0]);
});

test("GET /api/dedup/suspects loads and enriches grouped notes", async () => {
  const attachmentCalls = [];
  const tagCalls = [];
  const options = makeBaseOptions({
    pool: {
      async query(sql, params = []) {
        options.calls.push({ sql, params });
        if (sql === DEDUP_GROUPS_SQL) {
          return {
            rows: [
              { dup_key: "a", ids: [2, 1], cnt: 2 },
              { dup_key: "b", ids: [3, 2], cnt: 2 },
            ],
          };
        }
        if (sql === DEDUP_NOTES_SQL) {
          return {
            rows: [
              { id: 1, note_text: "one", thumbnail: "thumb-1" },
              { id: 2, note_text: "two", thumbnail: null },
              { id: 3, note_text: "three", thumbnail: null },
            ],
          };
        }
        return { rows: [] };
      },
    },
    async getAttachmentsForNotes(ids) {
      attachmentCalls.push(ids);
      return new Map([
        [1, [{ id: 10, attachment_full: "file:note/1.pdf" }]],
        [2, [{ id: 20, attachment_full: "file:note/2.pdf" }]],
      ]);
    },
    async checkTagTablesExist() {
      return true;
    },
    async getTagsForNotes(ids) {
      tagCalls.push(ids);
      return new Map([
        [1, [{ id: 100, name: "alpha" }]],
        [2, [{ id: 200, name: "beta" }]],
      ]);
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/dedup/suspects",
    query: { limit: "2", offset: "4" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(options.calls.map((call) => call.sql), [DEDUP_GROUPS_SQL, DEDUP_NOTES_SQL]);
  assert.deepEqual(options.calls[0].params, [2, 4]);
  assert.deepEqual(options.calls[1].params, [[2, 1, 3]]);
  assert.deepEqual(attachmentCalls, [[1, 2, 3]]);
  assert.deepEqual(tagCalls, [[1, 2, 3]]);
  assert.deepEqual(response.body.groups.map((group) => group.ids), [[2, 1], [3, 2]]);
  assert.deepEqual(response.body.groups[0].notes.map((note) => note.id), [2, 1]);
  assert.deepEqual(response.body.groups[1].notes.map((note) => note.id), [3, 2]);
  assert.deepEqual(response.body.groups[0].notes[1].attachments, [
    { id: 10, attachment_full: "file:note/1.pdf" },
  ]);
  assert.equal(response.body.groups[0].notes[1].thumbnail, "resolved:thumb-1");
  assert.equal(response.body.groups[0].notes[1].tags, "alpha");
  assert.deepEqual(response.body.groups[0].notes[1].tag_objects, [{ id: 100, name: "alpha" }]);
});

test("GET /api/dedup/suspects returns 500 on query failure", async () => {
  const options = makeBaseOptions({
    pool: {
      async query() {
        throw new Error("db failed");
      },
    },
  });
  const routes = makeRouteCollector(options);

  const response = await invoke(routes, {
    routePath: "/api/dedup/suspects",
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Failed to fetch duplicate suspects" });
});
