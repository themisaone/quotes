const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { registerMaintenanceRoutes } = require("../src/routes/maintenance");

const silentLogger = {
  error() {},
};

function makeRouteCollector(pool, {
  attachmentsDir = "/vault/attachments",
  exists = new Set(),
  files = new Map(),
  fsCalls = [],
  settingsFile = "/vault/config/settings.json",
  modesFile = "/app/config/modes.json",
  modesState = { ALL: ["quote", "note", "job"] },
  localConfig = { vaultPath: "/vault" },
} = {}) {
  const routes = new Map();
  const app = {
    get(routePath, handler) {
      routes.set(`GET ${routePath}`, handler);
    },
    post(routePath, handler) {
      routes.set(`POST ${routePath}`, handler);
    },
  };

  registerMaintenanceRoutes(app, {
    pool,
    fileStorage: {
      getAttachmentsDir() {
        return attachmentsDir;
      },
    },
    fsImpl: {
      existsSync(filePath) {
        return exists.has(filePath) || files.has(filePath);
      },
      readFileSync(filePath, encoding) {
        assert.equal(encoding, "utf8");
        if (files.has(filePath)) return files.get(filePath);
        throw new Error(`missing ${filePath}`);
      },
      mkdirSync(dirPath, options) {
        fsCalls.push(["mkdirSync", dirPath, options]);
      },
      renameSync(from, to) {
        fsCalls.push(["renameSync", from, to]);
        if (!exists.has(from)) throw new Error(`missing ${from}`);
        if (exists.has(to)) throw new Error(`target exists ${to}`);
        exists.delete(from);
        exists.add(to);
      },
    },
    getSettingsFile() {
      return settingsFile;
    },
    modesFile,
    modesState,
    readLocalConfig() {
      return localConfig;
    },
    logger: silentLogger,
  });

  return routes;
}

async function invoke(routes, { method = "POST", routePath, body = {} }) {
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

  await handler({ body }, res);
  return { status: res.statusCode, body: res.body };
}

test("GET /api/maintenance/health reports settings, mode, and DB type mismatches", async () => {
  const settingsFile = "/vault/config/settings.json";
  const calls = [];
  const pool = {
    dialect: "sqlite",
    filename: "/vault/archive.sqlite",
    async query(sql) {
      calls.push(sql);
      assert.match(sql, /COALESCE\(note_type, 'quote'\)/);
      return {
        rows: [
          { note_type: "job", count: "3" },
          { note_type: "legacy", count: "1" },
          { note_type: "quote", count: "2" },
        ],
      };
    },
  };
  const routes = makeRouteCollector(pool, {
    settingsFile,
    files: new Map([
      [settingsFile, JSON.stringify({ noteTypes: [{ value: "quote" }] })],
    ]),
    modesState: { ALL: ["quote", "job"] },
  });

  const response = await invoke(routes, {
    method: "GET",
    routePath: "/api/maintenance/health",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.status, "error");
  assert.equal(response.body.backend, "sqlite");
  assert.equal(response.body.sqliteFile, "/vault/archive.sqlite");
  assert.deepEqual(response.body.configuredTypes, {
    settings: ["quote"],
    modes: ["job", "quote"],
    db: ["job", "legacy", "quote"],
  });
  assert.deepEqual(response.body.mismatches, {
    modesMissingFromSettings: ["job"],
    dbMissingFromSettings: ["job", "legacy"],
    settingsMissingFromModes: [],
    dbMissingFromModes: ["legacy"],
  });
  assert.deepEqual(
    response.body.countsByNoteType.map((row) => [row.noteType, row.count]),
    [["job", 3], ["legacy", 1], ["quote", 2]],
  );
  assert.deepEqual(
    response.body.issues.map((issue) => issue.code),
    ["modes_missing_from_settings", "db_missing_from_settings", "db_missing_from_modes"],
  );
  assert.equal(calls.length, 1);
});

test("GET /api/maintenance/runtime-info reports backend without health queries", async () => {
  const calls = [];
  const pool = {
    dialect: "sqlite",
    filename: "/local/archive.sqlite",
    async query(sql) {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    },
  };
  const routes = makeRouteCollector(pool, {
    localConfig: {
      vaultPath: "/vault",
      activeMode: "ALL",
      sqlite: {
        enabled: true,
        path: "/local/archive.sqlite",
      },
    },
  });

  const response = await invoke(routes, {
    method: "GET",
    routePath: "/api/maintenance/runtime-info",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    backend: "sqlite",
    sqliteFile: "/local/archive.sqlite",
    vaultPath: "/vault",
    activeMode: "ALL",
  });
  assert.deepEqual(calls, []);
});

test("POST /api/maintenance/prune-unused-entities dry-runs unused entity details", async () => {
  const calls = [];
  const pool = {
    async query(sql) {
      calls.push(sql);
      if (/SELECT a\.id, a\.name/.test(sql)) {
        return { rows: [{ id: 1, name: "Unused Author" }], rowCount: 1 };
      }
      if (/SELECT s\.id, s\.name/.test(sql)) {
        return { rows: [{ id: 2, name: "Unused Source" }], rowCount: 1 };
      }
      if (/SELECT t\.id, t\.name, t\.type/.test(sql)) {
        return { rows: [{ id: 3, name: "Unused Tag", type: "quote" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      throw new Error("dry run should not open a transaction");
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/maintenance/prune-unused-entities",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    dryRun: true,
    authors: [{ id: 1, name: "Unused Author" }],
    sources: [{ id: 2, name: "Unused Source" }],
    tags: [{ id: 3, name: "Unused Tag", type: "quote" }],
    total: 3,
    authorsRemoved: 0,
    sourcesRemoved: 0,
    tagsRemoved: 0,
    authorsWouldRemove: 1,
    sourcesWouldRemove: 1,
    tagsWouldRemove: 1,
  });
  assert.equal(calls.length, 3);
  assert.match(calls[0], /SELECT a\.id, a\.name/);
  assert.match(calls[1], /SELECT s\.id, s\.name/);
  assert.match(calls[2], /SELECT t\.id, t\.name, t\.type/);
});

test("POST /api/maintenance/prune-unused-entities deletes unused entities in one transaction", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
      if (/DELETE FROM authors/.test(sql)) return { rows: [{ id: 1, name: "Unused Author" }], rowCount: 1 };
      if (/DELETE FROM sources/.test(sql)) {
        return {
          rows: [
            { id: 3, name: "Zed Source" },
            { id: 2, name: "Alpha Source" },
          ],
          rowCount: 2,
        };
      }
      if (/DELETE FROM tags/.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push("RELEASE");
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/maintenance/prune-unused-entities",
    body: { dryRun: false },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    dryRun: false,
    authors: [{ id: 1, name: "Unused Author" }],
    sources: [
      { id: 2, name: "Alpha Source" },
      { id: 3, name: "Zed Source" },
    ],
    tags: [],
    total: 3,
    authorsRemoved: 1,
    sourcesRemoved: 2,
    tagsRemoved: 0,
    authorsWouldRemove: 0,
    sourcesWouldRemove: 0,
    tagsWouldRemove: 0,
  });
  assert.equal(calls[0], "BEGIN");
  assert.match(calls[1], /DELETE FROM authors/);
  assert.match(calls[1], /RETURNING id, name/);
  assert.match(calls[2], /DELETE FROM sources/);
  assert.match(calls[2], /RETURNING id, name/);
  assert.match(calls[3], /DELETE FROM tags/);
  assert.match(calls[3], /RETURNING id, name, type/);
  assert.equal(calls[4], "COMMIT");
  assert.equal(calls[5], "RELEASE");
});

test("POST /api/maintenance/prune-unused-entities rolls back on failure", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (/DELETE FROM sources/.test(sql)) throw new Error("source delete failed");
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push("RELEASE");
    },
  };
  const pool = {
    async connect() {
      return client;
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/maintenance/prune-unused-entities",
    body: { dryRun: false },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "source delete failed" });
  assert.equal(calls[0], "BEGIN");
  assert.match(calls[1], /DELETE FROM authors/);
  assert.match(calls[2], /DELETE FROM sources/);
  assert.equal(calls[3], "ROLLBACK");
  assert.equal(calls[4], "RELEASE");
});

test("POST /api/maintenance/rehome-attachments returns a dry-run drift plan", async () => {
  const attachmentsDir = "/vault/attachments";
  const calls = [];
  const pool = {
    async query(sql) {
      calls.push(sql);
      return {
        rows: [
          {
            attachment_id: 1,
            note_id: 7,
            position: 0,
            note_type: "historical",
            attachment_full: "file:quote/7.pdf:application/pdf",
            thumbnail: null,
          },
          {
            attachment_id: 2,
            note_id: 8,
            position: 0,
            note_type: "quote",
            attachment_full: "file:quote/8.pdf:application/pdf",
            thumbnail: null,
          },
        ],
      };
    },
  };
  const routes = makeRouteCollector(pool, {
    attachmentsDir,
    exists: new Set([path.join(attachmentsDir, "quote", "7.pdf")]),
  });

  const response = await invoke(routes, {
    routePath: "/api/maintenance/rehome-attachments",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.dryRun, true);
  assert.equal(response.body.totalFileRefs, 2);
  assert.equal(response.body.driftCount, 1);
  assert.equal(response.body.movableCount, 1);
  assert.deepEqual(response.body.items, [
    {
      attachmentId: 1,
      noteId: 7,
      noteType: "historical",
      position: 0,
      column: "attachment_full",
      currentRef: "file:quote/7.pdf:application/pdf",
      currentPath: "quote/7.pdf",
      targetFolder: "historical",
      currentFolder: "quote",
      targetPath: "historical/7.pdf",
      targetRef: "file:historical/7.pdf:application/pdf",
      sourceExists: true,
      targetExists: false,
      status: "movable",
    },
  ]);
  assert.match(calls[0], /FROM note_attachments na/);
  assert.match(calls[0], /JOIN notes n/);
});

test("POST /api/maintenance/rehome-attachments applies movable items when dryRun is false", async () => {
  const attachmentsDir = "/vault/attachments";
  const source = path.join(attachmentsDir, "quote", "7.pdf");
  const target = path.join(attachmentsDir, "historical", "7.pdf");
  const existing = new Set([source]);
  const fsCalls = [];
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (/FROM note_attachments na/.test(sql)) {
        return {
          rows: [
            {
              attachment_id: 1,
              note_id: 7,
              position: 0,
              note_type: "historical",
              attachment_full: "file:quote/7.pdf:application/pdf",
              thumbnail: null,
            },
          ],
        };
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
    async query() {
      throw new Error("pool.query should not be called for apply");
    },
  };
  const routes = makeRouteCollector(pool, { attachmentsDir, exists: existing, fsCalls });

  const response = await invoke(routes, {
    routePath: "/api/maintenance/rehome-attachments",
    body: { dryRun: false },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.dryRun, false);
  assert.equal(response.body.applied.movedCount, 1);
  assert.equal(existing.has(source), false);
  assert.equal(existing.has(target), true);
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    `${require("../src/routes/maintenance").ATTACHMENT_REHOME_SELECT_SQL} FOR UPDATE OF na`,
    "SAVEPOINT rehome_attachment",
    "UPDATE note_attachments SET attachment_full = $1 WHERE id = $2",
    "UPDATE notes SET attachment_full = $1 WHERE id = $2",
    "RELEASE SAVEPOINT rehome_attachment",
    "COMMIT",
    "RELEASE",
  ]);
  assert.deepEqual(
    fsCalls.filter((call) => call[0] === "renameSync").map((call) => [call[1], call[2]]),
    [[source, target]]
  );
});
