const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  consolidateLegacyAttachmentFolders,
  fixTmpAttachmentRefs,
  registerAttachmentMigrationRoutes,
} = require("../src/routes/attachmentMigration");

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

  registerAttachmentMigrationRoutes(app, {
    logger: silentLogger,
    ...options,
  });
  return routes;
}

async function invoke(routes, { routePath = "/api/migrate/attachments-to-disk", body = {} } = {}) {
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
  return res;
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

function withTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-attachment-migration-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeFileStorage(root, calls = []) {
  return {
    getAttachmentsDir() {
      return root;
    },
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
    createFileReference(relativePath, mimeType) {
      return `file:${relativePath}:${mimeType}`;
    },
    processForStorage(value, folder, id, suffix, threshold, forceExternal) {
      calls.push(["processForStorage", value, folder, id, suffix, threshold, forceExternal]);
      if (String(value).includes("unstorable")) return null;
      return `file:${folder}/${id}.bin:application/octet-stream`;
    },
    deleteAttachment(value) {
      calls.push(["deleteAttachment", value]);
    },
  };
}

test("registerAttachmentMigrationRoutes registers the migration endpoint", () => {
  const routes = makeRouteCollector({
    pool: { connect() {} },
    fileStorage: makeFileStorage("/tmp/attachments"),
  });

  assert.equal(typeof routes.get("POST /api/migrate/attachments-to-disk"), "function");
});

test("POST /api/migrate/attachments-to-disk migrates base64 rows and syncs references", async () => {
  const storageCalls = [];
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
    if (/SELECT na\.id, na\.note_id/.test(sql)) {
      return {
        rows: [
          {
            id: 10,
            note_id: 7,
            position: 0,
            attachment_full: "data:image/png;base64,aaa",
            note_type: "quote",
          },
          {
            id: 11,
            note_id: 8,
            position: 2,
            attachment_full: "unstorable",
            note_type: "note",
          },
        ],
      };
    }
    if (/SELECT n\.id, n\.note_type/.test(sql)) {
      return {
        rows: [{
          id: 9,
          note_type: "historical",
          attachment_full: "data:application/pdf;base64,bbb",
        }],
      };
    }
    if (/SELECT 'na' AS tbl/.test(sql)) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });
  const routes = makeRouteCollector({
    pool: {
      async connect() {
        return client;
      },
    },
    fileStorage: makeFileStorage("/tmp/attachments", storageCalls),
    fsImpl: {
      existsSync() {
        return false;
      },
      mkdirSync() {},
      renameSync() {},
      unlinkSync() {},
    },
  });

  const res = await invoke(routes);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    migrated: 2,
    consolidated: 0,
    fixed: 0,
    cleared: 0,
    skipped: 1,
  });
  assert.deepEqual(storageCalls, [
    ["processForStorage", "data:image/png;base64,aaa", "quote", "7", "", 0, true],
    ["processForStorage", "data:application/pdf;base64,bbb", "historical", "9", "", 0, true],
  ]);
  assert.ok(client.calls.some((call) => (
    call.sql === "UPDATE note_attachments SET attachment_full = $1 WHERE id = $2" &&
    call.params[0] === "file:quote/7.bin:application/octet-stream" &&
    call.params[1] === 10
  )));
  assert.ok(client.calls.some((call) => (
    call.sql === "UPDATE notes SET attachment_full = $1 WHERE id = $2" &&
    call.params[0] === "file:historical/9.bin:application/octet-stream" &&
    call.params[1] === 9
  )));
  assert.ok(client.calls.some((call) => /UPDATE notes n/.test(call.sql)));
  assert.ok(client.calls.some((call) => /UPDATE note_attachments na/.test(call.sql)));
  assert.equal(client.calls.at(-1).sql, "COMMIT");
  assert.equal(client.released, true);
});

test("consolidateLegacyAttachmentFolders renames plural folders and updates DB refs", async (t) => {
  const root = withTempDir(t);
  fs.mkdirSync(path.join(root, "quotes"), { recursive: true });
  fs.writeFileSync(path.join(root, "quotes", "5.pdf"), "pdf");
  const client = makeClient((sql, params) => {
    if (/SELECT id, attachment_full FROM note_attachments/.test(sql) && params[0] === "file:quotes/%") {
      return { rows: [{ id: 10, attachment_full: "file:quotes/5.pdf:application/pdf" }] };
    }
    if (/SELECT id, attachment_full FROM notes/.test(sql) && params[0] === "file:quotes/%") {
      return { rows: [{ id: 20, attachment_full: "file:quotes/missing.pdf:application/pdf" }] };
    }
    return { rows: [], rowCount: 1 };
  });

  const consolidated = await consolidateLegacyAttachmentFolders({
    client,
    fileStorage: makeFileStorage(root),
  });

  assert.equal(consolidated, 2);
  assert.equal(fs.existsSync(path.join(root, "quotes", "5.pdf")), false);
  assert.equal(fs.readFileSync(path.join(root, "quote", "5.pdf"), "utf8"), "pdf");
  assert.ok(client.calls.some((call) => (
    call.sql === "UPDATE note_attachments SET attachment_full = $1 WHERE id = $2" &&
    call.params[0] === "file:quote/5.pdf:application/pdf" &&
    call.params[1] === 10
  )));
  assert.ok(client.calls.some((call) => (
    call.sql === "UPDATE notes SET attachment_full = $1 WHERE id = $2" &&
    call.params[0] === "file:quote/missing.pdf:application/pdf" &&
    call.params[1] === 20
  )));
});

test("fixTmpAttachmentRefs repairs, reuses, and clears stale tmp references", async (t) => {
  const root = withTempDir(t);
  fs.mkdirSync(path.join(root, "note"), { recursive: true });
  fs.writeFileSync(path.join(root, "note", "tmp_live.pdf"), "pdf");
  const client = makeClient((sql) => {
    if (/SELECT 'na' AS tbl/.test(sql)) {
      return {
        rows: [
          {
            tbl: "na",
            row_id: 1,
            note_id: 7,
            position: 0,
            attachment_full: "file:note/tmp_live.pdf:application/pdf",
            notes_full: null,
          },
          {
            tbl: "na",
            row_id: 2,
            note_id: 8,
            position: 1,
            attachment_full: "file:note/tmp_missing.pdf:application/pdf",
            notes_full: "file:note/8.pdf:application/pdf",
          },
          {
            tbl: "note",
            row_id: 3,
            note_id: 9,
            position: -1,
            attachment_full: "file:note/tmp_gone.pdf:application/pdf",
            notes_full: "file:note/tmp_gone.pdf:application/pdf",
          },
        ],
      };
    }
    return { rows: [], rowCount: 1 };
  });

  const result = await fixTmpAttachmentRefs({
    client,
    fileStorage: makeFileStorage(root),
  });

  assert.deepEqual(result, { fixed: 2, cleared: 1 });
  assert.equal(fs.existsSync(path.join(root, "note", "tmp_live.pdf")), false);
  assert.equal(fs.readFileSync(path.join(root, "note", "7.pdf"), "utf8"), "pdf");
  assert.ok(client.calls.some((call) => (
    call.sql === "UPDATE note_attachments SET attachment_full = $1 WHERE id = $2" &&
    call.params[0] === "file:note/7.pdf:application/pdf" &&
    call.params[1] === 1
  )));
  assert.ok(client.calls.some((call) => (
    call.sql === "UPDATE note_attachments SET attachment_full = $1 WHERE id = $2" &&
    call.params[0] === "file:note/8.pdf:application/pdf" &&
    call.params[1] === 2
  )));
  assert.ok(client.calls.some((call) => (
    call.sql === "UPDATE notes SET attachment_full = $1 WHERE id = $2" &&
    call.params[0] === null &&
    call.params[1] === 3
  )));
});

test("POST /api/migrate/attachments-to-disk moves legacy files back when the DB update fails", async (t) => {
  const root = withTempDir(t);
  fs.mkdirSync(path.join(root, "quotes"), { recursive: true });
  fs.writeFileSync(path.join(root, "quotes", "5.pdf"), "pdf");
  const client = makeClient((sql, params) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (/SELECT id, attachment_full FROM note_attachments/.test(sql) && params[0] === "file:quotes/%") {
      return { rows: [{ id: 10, attachment_full: "file:quotes/5.pdf:application/pdf" }] };
    }
    if (/SELECT id, attachment_full FROM notes/.test(sql) && params[0] === "file:quotes/%") {
      return { rows: [] };
    }
    if (/UPDATE note_attachments SET attachment_full/.test(sql)) {
      throw new Error("update failed");
    }
    return { rows: [], rowCount: 0 };
  });
  const routes = makeRouteCollector({
    pool: {
      async connect() {
        return client;
      },
    },
    fileStorage: makeFileStorage(root),
  });

  const res = await invoke(routes);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "update failed" });
  assert.equal(fs.existsSync(path.join(root, "quotes", "5.pdf")), true);
  assert.equal(fs.existsSync(path.join(root, "quote", "5.pdf")), false);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.released, true);
});

test("POST /api/migrate/attachments-to-disk deletes newly written files when row migration fails", async () => {
  const storageCalls = [];
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (/SELECT na\.id, na\.note_id/.test(sql)) {
      return {
        rows: [{
          id: 10,
          note_id: 7,
          position: 0,
          attachment_full: "data:image/png;base64,aaa",
          note_type: "quote",
        }],
      };
    }
    if (/UPDATE note_attachments SET attachment_full/.test(sql)) {
      throw new Error("update failed");
    }
    return { rows: [], rowCount: 0 };
  });
  const routes = makeRouteCollector({
    pool: {
      async connect() {
        return client;
      },
    },
    fileStorage: makeFileStorage("/tmp/attachments", storageCalls),
    fsImpl: {
      existsSync() {
        return false;
      },
      mkdirSync() {},
      renameSync() {},
      unlinkSync() {},
    },
  });

  const res = await invoke(routes);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "update failed" });
  assert.deepEqual(storageCalls.filter((call) => call[0] === "deleteAttachment"), [
    ["deleteAttachment", "file:quote/7.bin:application/octet-stream"],
  ]);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.released, true);
});

test("POST /api/migrate/attachments-to-disk rolls back on migration errors", async () => {
  const client = makeClient((sql) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    if (/SELECT na\.id, na\.note_id/.test(sql)) throw new Error("db down");
    return { rows: [], rowCount: 0 };
  });
  const routes = makeRouteCollector({
    pool: {
      async connect() {
        return client;
      },
    },
    fileStorage: makeFileStorage("/tmp/attachments"),
    fsImpl: {
      existsSync() {
        return false;
      },
      mkdirSync() {},
      renameSync() {},
      unlinkSync() {},
    },
  });

  const res = await invoke(routes);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "db down" });
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.released, true);
});
