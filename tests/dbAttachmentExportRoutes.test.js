const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildDbAttachmentExportTarget,
  exportDbAttachmentRows,
  registerDbAttachmentExportRoutes,
} = require("../src/routes/dbAttachmentExport");

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

  registerDbAttachmentExportRoutes(app, {
    logger: silentLogger,
    ...options,
  });
  return routes;
}

async function invoke(routes, { routePath = "/api/export/db-attachments", body = {} } = {}) {
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

function withTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-db-export-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeFileStorage() {
  return {
    MIME_TO_EXT: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "application/pdf": "pdf",
    },
  };
}

test("registerDbAttachmentExportRoutes registers the DB attachment export endpoint", () => {
  const routes = makeRouteCollector({
    pool: { query() {} },
    fileStorage: makeFileStorage(),
  });

  assert.equal(typeof routes.get("POST /api/export/db-attachments"), "function");
});

test("POST /api/export/db-attachments exports base64 multi and flat attachment rows", async (t) => {
  const tempHome = withTempDir(t);
  const calls = [];
  const pool = {
    async query(sql) {
      calls.push(sql);
      if (/SELECT na\.id, na\.note_id/.test(sql)) {
        return {
          rows: [
            {
              note_id: 7,
              position: 0,
              attachment_full: "data:image/png;base64,aGVsbG8=",
              note_type: "quote",
            },
            {
              note_id: 8,
              position: 1,
              attachment_full: "not-a-data-url",
              note_type: "note",
            },
          ],
        };
      }
      if (/SELECT n\.id AS note_id/.test(sql)) {
        return {
          rows: [{
            note_id: 9,
            position: -1,
            attachment_full: "data:application/pdf;base64,cGRm",
            note_type: "historical",
          }],
        };
      }
      return { rows: [] };
    },
  };
  const routes = makeRouteCollector({
    pool,
    fileStorage: makeFileStorage(),
    osImpl: { homedir: () => tempHome },
  });

  const res = await invoke(routes);
  const outBase = path.join(tempHome, "Downloads", "DB-attachments");

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    exported: 2,
    skipped: 1,
    outputDir: outBase,
    files: [
      { noteId: 7, file: path.join("quote", "7_0.png") },
      { noteId: 9, file: path.join("historical", "9.pdf") },
    ],
  });
  assert.equal(fs.readFileSync(path.join(outBase, "quote", "7_0.png"), "utf8"), "hello");
  assert.equal(fs.readFileSync(path.join(outBase, "historical", "9.pdf"), "utf8"), "pdf");
  assert.equal(calls.length, 2);
  assert.match(calls[0], /ORDER BY na\.note_id, na\.position/);
  assert.match(calls[1], /NOT EXISTS/);
});

test("buildDbAttachmentExportTarget derives fallback extension and default folder", () => {
  const target = buildDbAttachmentExportTarget(
    {
      note_id: 11,
      position: -1,
      note_type: "",
      attachment_full: "data:application/octet-stream;base64,Ymlu",
    },
    "/tmp/out",
    { pathImpl: path, mimeToExt: {} },
  );

  assert.deepEqual(target, {
    noteId: 11,
    noteType: "notes",
    filename: "11.octet-stream",
    outDir: path.join("/tmp/out", "notes"),
    outFile: path.join("/tmp/out", "notes", "11.octet-stream"),
    relativeFile: path.join("notes", "11.octet-stream"),
    base64Data: "Ymlu",
  });
  assert.equal(buildDbAttachmentExportTarget({ attachment_full: "bad" }, "/tmp/out"), null);
});

test("exportDbAttachmentRows skips existing files and write failures", async () => {
  const calls = [];
  const fsImpl = {
    existsSync(file) {
      return file.includes("existing");
    },
    mkdirSync(dir, options) {
      calls.push(["mkdirSync", dir, options]);
    },
    writeFileSync(file) {
      calls.push(["writeFileSync", file]);
      throw new Error("disk full");
    },
  };

  const result = await exportDbAttachmentRows({
    rows: [
      {
        note_id: "existing",
        position: 0,
        note_type: "quote",
        attachment_full: "data:image/jpeg;base64,ZXhpc3Rpbmc=",
      },
      {
        note_id: "failing",
        position: 1,
        note_type: "quote",
        attachment_full: "data:image/jpeg;base64,ZmFpbGluZw==",
      },
    ],
    outBase: "/tmp/out",
    fileStorage: makeFileStorage(),
    fsImpl,
    pathImpl: path,
    logger: silentLogger,
  });

  assert.deepEqual(result, { exported: 0, skipped: 2, files: [] });
  assert.deepEqual(calls, [
    ["mkdirSync", path.join("/tmp/out", "quote"), { recursive: true }],
    ["writeFileSync", path.join("/tmp/out", "quote", "failing_1.jpg")],
  ]);
});

test("POST /api/export/db-attachments reports query failures", async () => {
  const routes = makeRouteCollector({
    pool: {
      async query() {
        throw new Error("db down");
      },
    },
    fileStorage: makeFileStorage(),
  });

  const res = await invoke(routes);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "db down" });
});
