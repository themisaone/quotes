const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { registerExportImportRoutes } = require("../src/routes/exportImport");

const silentLogger = {
  error() {},
  log() {},
  warn() {},
};

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.statusCode = 200;
    this.body = undefined;
    this.chunks = [];
    this.headersSent = false;
    this.writableEnded = false;
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  write(chunk, encoding) {
    this.headersSent = true;
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
    this.lastEncoding = encoding;
    return true;
  }

  end(callback) {
    this.writableEnded = true;
    if (callback) callback();
    return this;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  json(value) {
    this.headersSent = true;
    this.writableEnded = true;
    this.body = value;
    return this;
  }

  send(value) {
    this.headersSent = true;
    this.writableEnded = true;
    this.body = value;
    return this;
  }
}

function makeRouteCollector(options) {
  const routes = new Map();
  const app = {
    get(routePath, handler) {
      routes.set(`GET ${routePath}`, handler);
    },
    post(routePath, handler) {
      routes.set(`POST ${routePath}`, handler);
    },
  };

  registerExportImportRoutes(app, {
    logger: silentLogger,
    ...options,
  });
  return routes;
}

async function invoke(routes, { method = "GET", routePath, query = {}, body = {} }) {
  const handler = routes.get(`${method} ${routePath}`);
  assert.equal(typeof handler, "function", `missing route: ${method} ${routePath}`);

  const req = new EventEmitter();
  req.query = query;
  req.body = body;
  const res = new MockResponse();

  await handler(req, res);
  return res;
}

function withTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-export-routes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeFileStorage(attachmentsDir, calls = []) {
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
    processForStorage(value, type, id, suffix, threshold, forceExternal) {
      calls.push(["processForStorage", value, type, id, suffix, threshold, forceExternal]);
      return value ? `stored:${type}:${id}:${suffix}:${value}` : null;
    },
    deleteAttachment(value) {
      calls.push(["deleteAttachment", value]);
    },
  };
}

function makeSettingsFile(t, dir, settings = {}) {
  const settingsFile = path.join(dir, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify(settings));
  t.after(() => fs.rmSync(settingsFile, { force: true }));
  return settingsFile;
}

test("registerExportImportRoutes registers JSON export/import endpoints", (t) => {
  const dir = withTempDir(t);
  const routes = makeRouteCollector({
    pool: { query() {}, connect() {} },
    fileStorage: makeFileStorage(dir),
    getSettingsFile: () => path.join(dir, "settings.json"),
  });

  for (const route of [
    "GET /api/export/json",
    "GET /api/export/big-files-report",
    "GET /api/export/big-files-info",
    "GET /api/export/big-files-zip",
    "POST /api/import/json",
  ]) {
    assert.equal(typeof routes.get(route), "function", route);
  }
});

test("GET /api/export/json streams an empty filtered backup", async (t) => {
  const dir = withTempDir(t);
  const settingsFile = makeSettingsFile(t, dir, { externalStorageThreshold: 2 });
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === "SELECT * FROM authors ORDER BY id") return { rows: [{ id: 1, name: "Ada" }] };
      if (sql === "SELECT * FROM sources ORDER BY id") return { rows: [] };
      if (sql === "SELECT * FROM tags    ORDER BY id") return { rows: [] };
      if (/FROM authors a/.test(sql)) return { rows: [] };
      if (/FROM sources s/.test(sql)) return { rows: [] };
      if (/FROM tags t/.test(sql)) return { rows: [] };
      if (/SELECT COUNT\(\*\)(?: AS count)? FROM notes/.test(sql)) return { rows: [{ count: "0" }] };
      if (/FROM notes q/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  const routes = makeRouteCollector({
    pool,
    fileStorage: makeFileStorage(dir),
    getSettingsFile: () => settingsFile,
  });

  const res = await invoke(routes, {
    routePath: "/api/export/json",
    query: { note_type: "quote" },
  });

  const parsed = JSON.parse(res.chunks.join(""));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/json");
  assert.match(res.headers["content-disposition"], /quotes_backup_/);
  assert.equal(parsed.noteTypeFilter, "quote");
  assert.deepEqual(parsed.counts, { authors: 0, sources: 0, tags: 0, quotes: 0 });
  assert.deepEqual(parsed.data.authors, []);
  assert.ok(Array.isArray(parsed.data.noteTypes));
  assert.ok(parsed.data.noteTypes.some((type) => type.value === "quote"));
  assert.deepEqual(parsed.data.quotes, []);
  assert.equal(parsed.data._bigFilesCount, 0);
  assert.deepEqual(calls.find((call) => /SELECT COUNT/.test(call.sql)).params, ["quote"]);
  assert.deepEqual(calls.find((call) => /FROM notes q/.test(call.sql)).params, [0, 200, "quote"]);
});

test("GET /api/export/json tracks big files for report and info endpoints", async (t) => {
  const dir = withTempDir(t);
  const noteDir = path.join(dir, "note");
  fs.mkdirSync(noteDir, { recursive: true });
  fs.writeFileSync(path.join(noteDir, "5.pdf"), Buffer.alloc(20));
  const settingsFile = makeSettingsFile(t, dir, { externalStorageThreshold: 0.000001 });
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === "SELECT * FROM authors ORDER BY id") return { rows: [] };
      if (sql === "SELECT * FROM sources ORDER BY id") return { rows: [] };
      if (sql === "SELECT * FROM tags    ORDER BY id") return { rows: [] };
      if (/SELECT COUNT\(\*\)(?: AS count)? FROM notes/.test(sql)) return { rows: [{ count: "1" }] };
      if (/FROM notes q/.test(sql)) {
        return {
          rows: [{
            id: 5,
            note_text: "large",
            note_date: "2026-06-24T12:00:00.000Z",
            attachment_full: "legacy-flat",
            thumbnail: null,
          }],
        };
      }
      if (/FROM note_attachments/.test(sql)) {
        return {
          rows: [{
            note_id: 5,
            position: 0,
            thumbnail: null,
            attachment_full: "file:note/5.pdf:application/pdf",
            attachment_type: "pdf",
            filename: "5.pdf",
          }],
        };
      }
      return { rows: [] };
    },
  };
  const routes = makeRouteCollector({
    pool,
    fileStorage: makeFileStorage(dir),
    getSettingsFile: () => settingsFile,
  });

  const exportRes = await invoke(routes, { routePath: "/api/export/json" });
  const parsed = JSON.parse(exportRes.chunks.join(""));

  assert.equal(parsed.data.quotes[0].note_date, "2026-06-24");
  assert.equal(parsed.data.quotes[0].attachment_full, undefined);
  assert.equal(parsed.data.quotes[0].attachments[0].attachment_full, "file:note/5.pdf:application/pdf");
  assert.equal(parsed.data._bigFilesCount, 1);

  const infoRes = await invoke(routes, { routePath: "/api/export/big-files-info" });
  assert.deepEqual(infoRes.body, { count: 1, totalMB: 0 });

  const reportRes = await invoke(routes, { routePath: "/api/export/big-files-report" });
  assert.equal(reportRes.statusCode, 200);
  assert.match(reportRes.body, /note\/5\.pdf/);
});

test("big file companion endpoints return no content before an export", async (t) => {
  const dir = withTempDir(t);
  const routes = makeRouteCollector({
    pool: { query() {}, connect() {} },
    fileStorage: makeFileStorage(dir),
    getSettingsFile: () => path.join(dir, "settings.json"),
  });

  const reportRes = await invoke(routes, { routePath: "/api/export/big-files-report" });
  const zipRes = await invoke(routes, { routePath: "/api/export/big-files-zip" });
  const infoRes = await invoke(routes, { routePath: "/api/export/big-files-info" });

  assert.equal(reportRes.statusCode, 204);
  assert.equal(reportRes.writableEnded, true);
  assert.equal(zipRes.statusCode, 204);
  assert.equal(zipRes.writableEnded, true);
  assert.deepEqual(infoRes.body, { count: 0, totalMB: 0 });
});

test("POST /api/import/json rejects invalid payloads and releases the client", async (t) => {
  const dir = withTempDir(t);
  const client = {
    released: false,
    calls: [],
    async query(sql, params = []) {
      this.calls.push({ sql, params });
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
  const routes = makeRouteCollector({
    pool: {
      async connect() {
        return client;
      },
    },
    fileStorage: makeFileStorage(dir),
    getSettingsFile: () => path.join(dir, "settings.json"),
  });

  const res = await invoke(routes, {
    method: "POST",
    routePath: "/api/import/json",
    body: { data: { authors: [], sources: [] } },
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Invalid import data structure" });
  assert.deepEqual(client.calls, []);
  assert.equal(client.released, true);
});

test("POST /api/import/json imports an empty backup successfully", async (t) => {
  const dir = withTempDir(t);
  const calls = [];
  const client = {
    released: false,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/pg_get_serial_sequence/.test(sql)) {
        return { rows: [{ seq: "public.notes_id_seq" }] };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      this.released = true;
    },
  };
  const routes = makeRouteCollector({
    pool: {
      async connect() {
        return client;
      },
    },
    fileStorage: makeFileStorage(dir),
    getSettingsFile: () => path.join(dir, "settings.json"),
  });

  const res = await invoke(routes, {
    method: "POST",
    routePath: "/api/import/json",
    body: { data: { authors: [], sources: [], tags: [], quotes: [] }, options: {} },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.stats, {
    authors: { created: 0, updated: 0, skipped: 0 },
    sources: { created: 0, updated: 0, skipped: 0 },
    tags: { created: 0, updated: 0, skipped: 0 },
    quotes: { created: 0, updated: 0, skipped: 0 },
    errors: [],
  });
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT pg_get_serial_sequence('notes', 'id') AS seq",
    "SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM notes), 1), true)",
    "SELECT pg_get_serial_sequence('notes', 'id') AS seq",
    "SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM notes), 1), true)",
    "COMMIT",
  ]);
  assert.equal(client.released, true);
});

test("POST /api/import/json removes files created for a rolled-back note savepoint", async (t) => {
  const dir = withTempDir(t);
  const storageCalls = [];
  const fileStorage = makeFileStorage(dir, storageCalls);
  fileStorage.processForStorage = function processForStorage(value, type, id, suffix, threshold, forceExternal) {
    storageCalls.push(["processForStorage", value, type, id, suffix, threshold, forceExternal]);
    if (!value) return null;
    return `file:${type}/${id}${suffix || ""}${forceExternal ? "-full" : "-thumb"}.bin:application/octet-stream`;
  };

  const calls = [];
  const client = {
    released: false,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "SAVEPOINT import_note" || sql === "ROLLBACK TO SAVEPOINT import_note") {
        return { rows: [], rowCount: 0 };
      }
      if (/pg_get_serial_sequence/.test(sql)) {
        return { rows: [{ seq: "public.notes_id_seq" }] };
      }
      if (/SELECT setval/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT id FROM notes\s+WHERE id = \$1\s+AND note_text/.test(sql)) {
        return { rows: [] };
      }
      if (sql === "SELECT id FROM notes WHERE id = $1") {
        return { rows: [] };
      }
      if (/INSERT INTO notes \(id, note_text/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO note_attachments/.test(sql)) {
        throw new Error("attachment insert failed");
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      this.released = true;
    },
  };
  const routes = makeRouteCollector({
    pool: {
      async connect() {
        return client;
      },
    },
    fileStorage,
    getSettingsFile: () => path.join(dir, "settings.json"),
  });

  const res = await invoke(routes, {
    method: "POST",
    routePath: "/api/import/json",
    body: {
      data: {
        authors: [],
        sources: [],
        tags: [],
        quotes: [{
          id: 7,
          note_text: "bad attachment",
          note_type: "quote",
          thumbnail: "data:image/png;base64,thumb",
          attachment_full: "data:application/pdf;base64,full",
          attachment_type: "pdf",
        }],
      },
      options: {},
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.stats.quotes.created, 0);
  assert.match(res.body.stats.errors[0], /attachment insert failed/);
  assert.deepEqual(storageCalls.filter((call) => call[0] === "deleteAttachment"), [
    ["deleteAttachment", "file:quote/7-thumb.bin:application/octet-stream"],
    ["deleteAttachment", "file:quote/7-full.bin:application/octet-stream"],
  ]);
  assert.ok(calls.some((call) => call.sql === "ROLLBACK TO SAVEPOINT import_note"));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
  assert.equal(client.released, true);
});

test("POST /api/import/json removes imported files when the whole transaction rolls back", async (t) => {
  const dir = withTempDir(t);
  const storageCalls = [];
  const fileStorage = makeFileStorage(dir, storageCalls);
  fileStorage.processForStorage = function processForStorage(value, type, id, suffix, threshold, forceExternal) {
    storageCalls.push(["processForStorage", value, type, id, suffix, threshold, forceExternal]);
    if (!value) return null;
    return `file:${type}/${id}${suffix || ""}${forceExternal ? "-full" : "-thumb"}.bin:application/octet-stream`;
  };

  const calls = [];
  const client = {
    released: false,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "SAVEPOINT import_note" || sql === "RELEASE SAVEPOINT import_note" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (sql === "COMMIT") {
        throw new Error("commit failed");
      }
      if (/pg_get_serial_sequence/.test(sql)) {
        return { rows: [{ seq: "public.notes_id_seq" }] };
      }
      if (/SELECT setval/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT id FROM notes\s+WHERE id = \$1\s+AND note_text/.test(sql)) {
        return { rows: [] };
      }
      if (sql === "SELECT id FROM notes WHERE id = $1") {
        return { rows: [] };
      }
      if (/INSERT INTO notes \(id, note_text/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO note_attachments/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE notes SET thumbnail/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      this.released = true;
    },
  };
  const routes = makeRouteCollector({
    pool: {
      async connect() {
        return client;
      },
    },
    fileStorage,
    getSettingsFile: () => path.join(dir, "settings.json"),
  });

  const res = await invoke(routes, {
    method: "POST",
    routePath: "/api/import/json",
    body: {
      data: {
        authors: [],
        sources: [],
        tags: [],
        quotes: [{
          id: 8,
          note_text: "good until commit",
          note_type: "quote",
          thumbnail: "data:image/png;base64,thumb",
          attachment_full: "data:application/pdf;base64,full",
          attachment_type: "pdf",
        }],
      },
      options: {},
    },
  });

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Failed to import data", details: "commit failed" });
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.deepEqual(storageCalls.filter((call) => call[0] === "deleteAttachment"), [
    ["deleteAttachment", "file:quote/8-thumb.bin:application/octet-stream"],
    ["deleteAttachment", "file:quote/8-full.bin:application/octet-stream"],
  ]);
  assert.equal(client.released, true);
});
