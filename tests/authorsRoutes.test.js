const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const fileStorage = require("../src/fileStorage");
const { registerAuthorRoutes } = require("../src/routes/authors");

let tmpAttachmentsRoot;

test.beforeEach(() => {
  tmpAttachmentsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "author-route-test-"));
  fileStorage.setAttachmentsDirAbsolute(path.join(tmpAttachmentsRoot, "attachments"));
});

test.afterEach(() => {
  if (tmpAttachmentsRoot) {
    fs.rmSync(tmpAttachmentsRoot, { recursive: true, force: true });
    tmpAttachmentsRoot = null;
  }
  fileStorage.setAttachmentsDirAbsolute(null);
});

const silentLogger = {
  error() {},
};

function makeRouteCollector(pool) {
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

  registerAuthorRoutes(app, { pool, logger: silentLogger });
  return routes;
}

async function invoke(routes, { method = "GET", routePath, params = {}, query = {}, body = {} }) {
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

  await handler({ params, query, body }, res);
  return { status: res.statusCode, body: res.body };
}

test("GET /api/authors delegates list query with search params", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 1, name: "Ada" }] };
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/authors",
    query: { search: "Ada" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [{ id: 1, name: "Ada" }]);
  assert.deepEqual(calls[0].params, ["%Ada%"]);
  assert.match(calls[0].sql, /a\.name ILIKE \$1/);
});

test("GET /api/authors/:id returns 404 when author is missing", async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/authors/:id",
    params: { id: "42" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Author not found" });
});

test("POST /api/authors requires a name and trims inserts", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("INSERT INTO authors")) {
        return { rows: [{ id: 1, name: params[0], image: params[1] || "" }] };
      }
      if (sql.startsWith("UPDATE authors SET image")) {
        return { rows: [{ id: 1, name: "Ada", image: params[0] }] };
      }
      return { rows: [] };
    },
  };
  const routes = makeRouteCollector(pool);

  const invalid = await invoke(routes, {
    method: "POST",
    routePath: "/api/authors",
    body: {},
  });
  const created = await invoke(routes, {
    method: "POST",
    routePath: "/api/authors",
    body: { name: " Ada ", thumbnail: PNG_DATA_URL },
  });

  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { error: "Author name is required" });
  assert.equal(created.status, 201);
  assert.equal(created.body.id, 1);
  assert.equal(created.body.name, "Ada");
  assert.match(created.body.image, /^file:authors\/1\.png:image\/png$/);
  assert.deepEqual(calls[0].params, ["Ada", ""]);
});

test("PUT /api/authors/:id rejects invalid image payloads before connecting", async () => {
  const pool = {
    async connect() {
      throw new Error("connect should not be called");
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/authors/:id",
    params: { id: "1" },
    body: { image: "https://example.test/image.png" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Invalid image format" });
});

test("PUT /api/authors/:id rolls back and releases when author is missing", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/authors/:id",
    params: { id: "99" },
    body: { name: "Missing" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Author not found" });
  assert.deepEqual(calls.map((c) => c.sql), [
    "BEGIN",
    "SELECT id, name, image FROM authors WHERE id = $1",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("PUT /api/authors/:id rejects empty update payloads after lookup", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      return { rows: [{ id: 1, name: "Ada" }] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/authors/:id",
    params: { id: "1" },
    body: {},
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "No author fields to update" });
  assert.equal(calls.some((c) => /UPDATE authors/.test(c.sql)), false);
});

test("PUT /api/authors/:id merges into an existing author", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.startsWith("SELECT id, name, image FROM authors")) {
        return { rows: [{ id: 1, name: "Old" }] };
      }
      if (sql.startsWith("SELECT id, name FROM authors")) {
        return { rows: [{ id: 2, name: "Existing" }] };
      }
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "PUT",
    routePath: "/api/authors/:id",
    params: { id: "1" },
    body: { name: "Existing" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    merged: true,
    oldName: "Old",
    newName: "Existing",
    targetAuthorId: 2,
    message: 'Author "Old" merged into existing author "Existing"',
  });
  assert.deepEqual(calls.map((c) => c.sql), [
    "BEGIN",
    "SELECT id, name, image FROM authors WHERE id = $1",
    "SELECT id, name FROM authors WHERE LOWER(name) = LOWER($1) AND id != $2",
    "UPDATE notes SET author_id = $1 WHERE author_id = $2",
    "DELETE FROM authors WHERE id = $1",
    "COMMIT",
    "RELEASE",
  ]);
});

test("DELETE /api/authors/:id guards linked notes and deletes unused authors", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) return { rows: [{ count: "2" }] };
      if (calls.length === 2) return { rows: [{ count: "0" }] };
      return { rows: [{ id: params[0], name: "Ada" }] };
    },
  };
  const routes = makeRouteCollector(pool);

  const guarded = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/authors/:id",
    params: { id: "1" },
  });
  const deleted = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/authors/:id",
    params: { id: "1" },
  });

  assert.equal(guarded.status, 400);
  assert.deepEqual(guarded.body, { error: "Cannot delete author with existing quotes" });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, { message: "Author deleted successfully" });
});
