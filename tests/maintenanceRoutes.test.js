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
  fsCalls = [],
} = {}) {
  const routes = new Map();
  const app = {
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
        return exists.has(filePath);
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

test("POST /api/maintenance/prune-unused-entities deletes unused entities in one transaction", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
      if (/DELETE FROM authors/.test(sql)) return { rows: [{ id: 1 }], rowCount: 1 };
      if (/DELETE FROM sources/.test(sql)) return { rows: [{ id: 2 }, { id: 3 }], rowCount: 2 };
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
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    authorsRemoved: 1,
    sourcesRemoved: 2,
    tagsRemoved: 0,
  });
  assert.deepEqual(calls, [
    "BEGIN",
    "\n      DELETE FROM authors a\n      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.author_id = a.id)\n      RETURNING id\n    ",
    "\n      DELETE FROM sources s\n      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.source_id = s.id)\n      RETURNING id\n    ",
    "\n      DELETE FROM tags t\n      WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = t.id)\n      RETURNING id\n    ",
    "COMMIT",
    "RELEASE",
  ]);
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
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "source delete failed" });
  assert.deepEqual(calls, [
    "BEGIN",
    "\n      DELETE FROM authors a\n      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.author_id = a.id)\n      RETURNING id\n    ",
    "\n      DELETE FROM sources s\n      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.source_id = s.id)\n      RETURNING id\n    ",
    "ROLLBACK",
    "RELEASE",
  ]);
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
