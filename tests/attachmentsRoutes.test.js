const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyAttachments,
  createAttachmentHelpers,
  isSafeAttachmentRelativePath,
  normalizeStorageFolder,
  registerAttachmentRoutes,
  sanitizeOriginalFilename,
} = require("../src/routes/attachments");

const silentLogger = {
  error() {},
};

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-attachments-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeFileStorage(overrides = {}) {
  const calls = [];
  return {
    calls,
    retrieveFromStorage(value) {
      return `resolved:${value}`;
    },
    finalizeUploadedFile(value, id, suffix) {
      calls.push(["finalizeUploadedFile", value, id, suffix]);
      return value ? `final:${id}:${value}` : value;
    },
    processForStorage(value, folder, id, suffix, threshold, forceExternal) {
      calls.push(["processForStorage", value, folder, id, suffix, threshold, forceExternal]);
      return value ? `stored:${folder}:${id}:${forceExternal}:${value}` : value;
    },
    deleteAttachment(value) {
      calls.push(["deleteAttachment", value]);
    },
    getAttachmentsDir() {
      return "/tmp";
    },
    ...overrides,
  };
}

function makeUpload(calls = []) {
  return {
    single(fieldName) {
      calls.push(["single", fieldName]);
      return function uploadMiddleware() {};
    },
  };
}

function makeRouteCollector(pool, options = {}) {
  const routes = new Map();
  const app = {
    get(routePath, ...handlers) {
      routes.set(`GET ${routePath}`, handlers);
    },
    post(routePath, ...handlers) {
      routes.set(`POST ${routePath}`, handlers);
    },
    delete(routePath, ...handlers) {
      routes.set(`DELETE ${routePath}`, handlers);
    },
    patch(routePath, ...handlers) {
      routes.set(`PATCH ${routePath}`, handlers);
    },
  };

  registerAttachmentRoutes(app, {
    pool,
    fileStorage: options.fileStorage || makeFileStorage(),
    upload: options.upload || makeUpload(),
    fsImpl: options.fsImpl || fs,
    pathImpl: options.pathImpl || path,
    logger: silentLogger,
  });
  return routes;
}

async function invoke(
  routes,
  { method = "GET", routePath, params = {}, query = {}, body = {}, file = undefined }
) {
  const handlers = routes.get(`${method} ${routePath}`);
  assert.ok(handlers && handlers.length > 0, `missing route: ${method} ${routePath}`);
  const handler = handlers[handlers.length - 1];

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

  await handler({ params, query, body, file }, res);
  return { status: res.statusCode, body: res.body };
}

test("attachment helpers preserve position-0 flat field behavior", async () => {
  assert.equal(normalizeStorageFolder(" note "), "note");
  assert.equal(normalizeStorageFolder("quotes"), "quote");
  assert.equal(normalizeStorageFolder("notes"), "note");
  assert.equal(normalizeStorageFolder("puzzles"), "puzzle");
  assert.throws(() => normalizeStorageFolder("../note"), /Invalid attachment folder/);
  assert.equal(isSafeAttachmentRelativePath("quote/7.jpg"), true);
  assert.equal(isSafeAttachmentRelativePath("../quote/7.jpg"), false);
  assert.equal(isSafeAttachmentRelativePath("quote\\7.jpg"), false);
  assert.equal(isSafeAttachmentRelativePath("/quote/7.jpg"), false);
  assert.equal(sanitizeOriginalFilename("../../secret.txt"), "secret.txt");
  assert.equal(sanitizeOriginalFilename("nested\\report.pdf"), "report.pdf");

  assert.deepEqual(
    applyAttachments(
      { id: 1, thumbnail: "old-thumb", attachment_full: "old-full", attachment_type: "image" },
      [{ thumbnail: "new-thumb", attachment_full: "new-full", attachment_type: "pdf" }]
    ),
    {
      id: 1,
      thumbnail: "new-thumb",
      attachment_full: "new-full",
      attachment_type: "pdf",
      attachments: [{ thumbnail: "new-thumb", attachment_full: "new-full", attachment_type: "pdf" }],
    }
  );

  const helpers = createAttachmentHelpers({
    pool: {
      async query() {
        return {
          rows: [
            {
              id: 1,
              note_id: 7,
              thumbnail: "file:note/thumb.jpg:image/jpeg",
              attachment_full: "file:note/full.pdf:application/pdf",
            },
          ],
        };
      },
    },
    fileStorage: makeFileStorage(),
  });

  const map = await helpers.getAttachmentsForNotes([7]);
  assert.deepEqual(map.get(7), [
    {
      id: 1,
      note_id: 7,
      thumbnail: "resolved:file:note/thumb.jpg:image/jpeg",
      attachment_full: "file:note/full.pdf:application/pdf",
    },
  ]);
});

test("POST /api/quotes/:id/downscale-thumbnail overwrites the full file and updates thumbnails", async (t) => {
  const dir = makeTempDir(t);
  fs.mkdirSync(path.join(dir, "quote"), { recursive: true });
  const fullPath = path.join(dir, "quote", "7.jpg");
  fs.writeFileSync(fullPath, "original");

  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  };
  const fileStorage = makeFileStorage({
    getAttachmentsDir() {
      return dir;
    },
    parseBase64Data(value) {
      assert.equal(value, "data:image/jpeg;base64,c21hbGw=");
      return { mimeType: "image/jpeg", data: "c21hbGw=" };
    },
  });
  const routes = makeRouteCollector(pool, { fileStorage });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/quotes/:id/downscale-thumbnail",
    params: { id: "7" },
    body: {
      thumbnail: "data:image/jpeg;base64,dGh1bWI=",
      attachment_full: "data:image/jpeg;base64,c21hbGw=",
      oldFilePath: "quote/7.jpg",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true });
  assert.equal(fs.readFileSync(fullPath, "utf8"), "small");
  assert.deepEqual(calls.map((call) => call.sql), [
    "UPDATE notes SET thumbnail = $1 WHERE id = $2",
    "UPDATE note_attachments SET thumbnail = $1\n         WHERE note_id = $2 AND (attachment_full LIKE $3 OR thumbnail LIKE $3)",
  ]);
  assert.deepEqual(calls[1].params, [
    "data:image/jpeg;base64,dGh1bWI=",
    "7",
    "file:quote/7.jpg%",
  ]);
});

test("POST /api/quotes/:id/downscale-thumbnail rejects unsafe old file paths before writing", async () => {
  const pool = {
    async query() {
      throw new Error("query should not be called");
    },
  };
  const fileStorage = makeFileStorage({
    parseBase64Data() {
      throw new Error("parseBase64Data should not be called");
    },
  });
  const routes = makeRouteCollector(pool, { fileStorage });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/quotes/:id/downscale-thumbnail",
    params: { id: "7" },
    body: {
      thumbnail: "thumb",
      attachment_full: "data:image/jpeg;base64,c21hbGw=",
      oldFilePath: "../quote/7.jpg",
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Invalid attachment path" });
});

test("GET /api/notes/:id/attachments resolves thumbnails and keeps full refs", async () => {
  const pool = {
    async query(sql, params) {
      assert.match(sql, /FROM note_attachments/);
      assert.deepEqual(params, ["7"]);
      return {
        rows: [
          {
            id: 1,
            thumbnail: "thumb",
            attachment_full: "file:note/full.pdf:application/pdf",
          },
        ],
      };
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    routePath: "/api/notes/:id/attachments",
    params: { id: "7" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    {
      id: 1,
      thumbnail: "resolved:thumb",
      attachment_full: "file:note/full.pdf:application/pdf",
    },
  ]);
});

test("POST /api/notes/:id/attachments inserts first attachment and syncs flat note fields", async () => {
  const calls = [];
  const fileStorage = makeFileStorage();
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (/SELECT note_type FROM notes/.test(sql)) {
        return { rows: [{ note_type: "quote" }] };
      }
      if (/COALESCE\(MAX\(position\), -1\)/.test(sql)) {
        return { rows: [{ next_pos: 0 }] };
      }
      if (/INSERT INTO note_attachments/.test(sql)) {
        return {
          rows: [
            {
              id: 2,
              note_id: params[0],
              position: params[1],
              thumbnail: params[2],
              attachment_full: params[3],
              attachment_type: params[4],
              filename: params[5],
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
  };
  const routes = makeRouteCollector(pool, { fileStorage });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/notes/:id/attachments",
    params: { id: "7" },
    body: {
      thumbnail: "thumb",
      attachment_full: "full",
      attachment_type: "pdf",
      filename: "report.pdf",
      storageThresholdMB: 2,
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.thumbnail.startsWith("resolved:stored:quote:7_a0:false"), true);
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT note_type FROM notes WHERE id = $1",
    "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM note_attachments WHERE note_id = $1",
    "INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)\n       VALUES ($1, $2, $3, $4, $5, 'base64', $6) RETURNING *",
    "UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4",
    "COMMIT",
    "RELEASE",
  ]);
  assert.deepEqual(fileStorage.calls.map((call) => call[0]), [
    "finalizeUploadedFile",
    "finalizeUploadedFile",
    "processForStorage",
    "processForStorage",
  ]);
});

test("POST /api/notes/:id/attachments rolls back when note is missing", async () => {
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
    method: "POST",
    routePath: "/api/notes/:id/attachments",
    params: { id: "404" },
    body: { attachment_full: "full" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Note not found" });
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT note_type FROM notes WHERE id = $1",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("DELETE /api/notes/:noteId/attachments/:attachId rolls back missing attachments", async () => {
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
    method: "DELETE",
    routePath: "/api/notes/:noteId/attachments/:attachId",
    params: { noteId: "7", attachId: "99" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Attachment not found" });
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT * FROM note_attachments WHERE id = $1 AND note_id = $2",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("DELETE /api/notes/:noteId/attachments/:attachId clears flat fields after deleting last attachment", async () => {
  const calls = [];
  const fileStorage = makeFileStorage();
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (/SELECT \* FROM note_attachments WHERE id/.test(sql)) {
        return {
          rows: [
            {
              id: 4,
              thumbnail: "file:note/thumb.jpg:image/jpeg",
              attachment_full: "file:note/full.pdf:application/pdf",
            },
          ],
        };
      }
      if (/ORDER BY position LIMIT 1/.test(sql)) return { rows: [] };
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
  const routes = makeRouteCollector(pool, { fileStorage });

  const response = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/notes/:noteId/attachments/:attachId",
    params: { noteId: "7", attachId: "4" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.deepEqual(fileStorage.calls, [
    ["deleteAttachment", "file:note/thumb.jpg:image/jpeg"],
    ["deleteAttachment", "file:note/full.pdf:application/pdf"],
  ]);
  assert.equal(
    calls.some((call) =>
      call.sql === "UPDATE notes SET thumbnail = NULL, attachment_full = NULL, attachment_type = NULL WHERE id = $1"
    ),
    true
  );
});

test("POST /api/notes/:id/attachments/file returns 400 before connecting when no file is uploaded", async () => {
  const pool = {
    async connect() {
      throw new Error("connect should not be called");
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/notes/:id/attachments/file",
    params: { id: "7" },
    body: {},
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "No file uploaded" });
});

test("POST /api/notes/:id/attachments/file removes temp file when folder is invalid", async (t) => {
  const dir = makeTempDir(t);
  const tmpPath = path.join(dir, "tmp.enc");
  fs.writeFileSync(tmpPath, "encrypted");

  const pool = {
    async connect() {
      throw new Error("connect should not be called");
    },
  };
  const fileStorage = makeFileStorage({
    getAttachmentsDir() {
      return dir;
    },
  });
  const routes = makeRouteCollector(pool, { fileStorage });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/notes/:id/attachments/file",
    params: { id: "7" },
    body: { folder: "../quote", original_name: "secret.txt" },
    file: {
      path: tmpPath,
      originalname: "raw.enc",
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Invalid attachment folder" });
  assert.equal(fs.existsSync(tmpPath), false);
});

test("POST /api/notes/:id/attachments/file moves file, inserts row, and syncs first attachment", async (t) => {
  const dir = makeTempDir(t);
  const tmpPath = path.join(dir, "tmp.enc");
  fs.writeFileSync(tmpPath, "encrypted");

  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (/COALESCE\(MAX\(position\) \+ 1/.test(sql)) return { rows: [{ pos: 0 }] };
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
  const fileStorage = makeFileStorage({
    getAttachmentsDir() {
      return dir;
    },
  });
  const routes = makeRouteCollector(pool, { fileStorage });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/notes/:id/attachments/file",
    params: { id: "7" },
    body: {
      folder: "quotes",
      original_name: "../../secret.txt",
      attachment_type: "encrypted",
    },
    file: {
      path: tmpPath,
      originalname: "raw.enc",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    fileRef: "file:quote/7.secret.txt.enc",
    relPath: "quote/7.secret.txt.enc",
  });
  assert.equal(fs.existsSync(path.join(dir, "quote", "7.secret.txt.enc")), true);
  assert.equal(fs.existsSync(tmpPath), false);
  assert.equal(
    calls.some((call) =>
      call.sql === "UPDATE notes SET thumbnail = NULL, attachment_full = $1, attachment_type = $2 WHERE id = $3"
    ),
    true
  );
});

test("POST /api/notes/:id/attachments/file removes moved file when DB insert fails", async (t) => {
  const dir = makeTempDir(t);
  const tmpPath = path.join(dir, "tmp.enc");
  fs.writeFileSync(tmpPath, "encrypted");

  const stablePath = path.join(dir, "note", "7.secret.txt.enc");
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (/COALESCE\(MAX\(position\) \+ 1/.test(sql)) return { rows: [{ pos: 0 }] };
      if (/INSERT INTO note_attachments/.test(sql)) throw new Error("insert failed");
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
  const fileStorage = makeFileStorage({
    getAttachmentsDir() {
      return dir;
    },
  });
  const routes = makeRouteCollector(pool, { fileStorage });

  const response = await invoke(routes, {
    method: "POST",
    routePath: "/api/notes/:id/attachments/file",
    params: { id: "7" },
    body: {
      folder: "note",
      original_name: "secret.txt",
    },
    file: {
      path: tmpPath,
      originalname: "raw.enc",
    },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "insert failed" });
  assert.equal(fs.existsSync(stablePath), false);
  assert.equal(fs.existsSync(tmpPath), false);
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM note_attachments WHERE note_id = $1",
    "INSERT INTO note_attachments (note_id, thumbnail, attachment_full, attachment_type, position)\n       VALUES ($1, $2, $3, $4, $5)",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("PATCH /api/notes/:noteId/attachments/:attachId/make-primary rolls back missing target", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      return { rows: [{ id: 1, thumbnail: "thumb", attachment_full: "full", attachment_type: "image" }] };
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
    method: "PATCH",
    routePath: "/api/notes/:noteId/attachments/:attachId/make-primary",
    params: { noteId: "7", attachId: "99" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: "Attachment not found" });
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("PATCH /api/notes/:noteId/attachments/:attachId/make-primary reorders and syncs flat fields", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (/SELECT \* FROM note_attachments WHERE note_id/.test(sql)) {
        return {
          rows: [
            { id: 1, thumbnail: "thumb1", attachment_full: "full1", attachment_type: "image" },
            { id: 2, thumbnail: "thumb2", attachment_full: "full2", attachment_type: "pdf" },
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
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [
          { id: 2, thumbnail: "thumb2", attachment_full: "full2", attachment_type: "pdf" },
          { id: 1, thumbnail: "thumb1", attachment_full: "full1", attachment_type: "image" },
        ],
      };
    },
  };
  const routes = makeRouteCollector(pool);

  const response = await invoke(routes, {
    method: "PATCH",
    routePath: "/api/notes/:noteId/attachments/:attachId/make-primary",
    params: { noteId: "7", attachId: "2" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    { id: 2, thumbnail: "resolved:thumb2", attachment_full: "full2", attachment_type: "pdf" },
    { id: 1, thumbnail: "resolved:thumb1", attachment_full: "full1", attachment_type: "image" },
  ]);
  assert.equal(
    calls.some((call) =>
      call.sql === "UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4" &&
      call.params[0] === "thumb2" &&
      call.params[1] === "full2" &&
      call.params[2] === "pdf"
    ),
    true
  );
});
