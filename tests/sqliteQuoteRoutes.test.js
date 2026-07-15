const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runMigrations } = require("../migrations/run-migrations");
const { createSqlitePool } = require("../src/db/sqlite");
const { createAttachmentHelpers } = require("../src/routes/attachments");
const { registerQuoteRoutes } = require("../src/routes/quotes");
const { createTagHelpers } = require("../src/tagHelpers");

process.on("warning", (warning) => {
  if (warning.name !== "ExperimentalWarning" || !/SQLite/.test(warning.message)) {
    throw warning;
  }
});

const silentLogger = {
  error() {},
  log() {},
};

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-sqlite-routes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
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

function makeFileStorage() {
  return {
    isFilePath(value) {
      return typeof value === "string" && value.startsWith("file:");
    },
    finalizeUploadedFile(value) {
      return value;
    },
    processForStorage(value) {
      return value || null;
    },
    retrieveFromStorage(value) {
      return value;
    },
    deleteAttachment() {},
  };
}

async function makeSqliteQuoteRoutes(t) {
  const dir = makeTempDir(t);
  const pool = createSqlitePool({ filename: path.join(dir, "archive.sqlite") });
  t.after(() => pool.end());
  await runMigrations({ pool, logger: silentLogger, quietWhenNoPending: true });

  const fileStorage = makeFileStorage();
  const attachmentHelpers = createAttachmentHelpers({ pool, fileStorage });
  const tagHelpers = createTagHelpers({ pool, logger: silentLogger });
  const routes = makeRouteCollector({
    pool,
    fileStorage,
    getAllowedTypes: () => ["quote", "note", "historical", "training", "DNEVNIK"],
    getDateBasedNoteTypes: () => ["training", "DNEVNIK"],
    getModeName: () => "TEST",
    getAttachmentsForNotes: attachmentHelpers.getAttachmentsForNotes,
    applyAttachments: attachmentHelpers.applyAttachments,
    retrieveQuoteImages(note) {
      return note;
    },
    checkTagTablesExist: tagHelpers.checkTagTablesExist,
    getTagsForNote: tagHelpers.getTagsForNote,
    getTagsForNotes: tagHelpers.getTagsForNotes,
    tagHelpers,
  });

  return { pool, routes };
}

test("SQLite diary lists sort by note date instead of update time", async (t) => {
  const { pool, routes } = await makeSqliteQuoteRoutes(t);

  await pool.query(
    `INSERT INTO notes (note_text, note_type, note_date, updated_at)
     VALUES ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12)`,
    [
      "July 12", "DNEVNIK", "2026-07-12", "2026-07-15 12:00:00",
      "July 13", "DNEVNIK", "2026-07-13", "2026-07-14 12:00:00",
      "July 8", "DNEVNIK", "2026-07-08", "2026-07-16 12:00:00",
    ]
  );

  const response = await invoke(routes, {
    routePath: "/api/quotes",
    query: { note_type: "DNEVNIK", limit: "20", offset: "0" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.map((note) => note.note_date), [
    "2026-07-13",
    "2026-07-12",
    "2026-07-08",
  ]);
});

test("SQLite quote routes support basic CRUD with normalized tags", async (t) => {
  const { pool, routes } = await makeSqliteQuoteRoutes(t);

  const created = await invoke(routes, {
    method: "POST",
    routePath: "/api/quotes",
    body: {
      note_text: "SQLite route coverage",
      note_title: "Portable note",
      author: "Ada Lovelace",
      source: "Notes",
      sourceType: "BOOK",
      note_type: "quote",
      comment: "created from route test",
      score: "5",
      tags: "sqlite, portable",
    },
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.note_text, "SQLite route coverage");
  assert.equal(created.body.author_name, "Ada Lovelace");
  assert.equal(created.body.source_name, "Notes");
  assert.equal(created.body.note_type, "quote");
  assert.equal(created.body.attachments.length, 0);
  assert.equal(created.body.tags, "portable, sqlite");
  assert.deepEqual(
    created.body.tag_objects.map((tag) => tag.name),
    ["portable", "sqlite"],
  );

  const count = await invoke(routes, {
    routePath: "/api/quotes/count",
    query: { note_type: "quote", quote: "SQLite" },
  });
  assert.equal(count.status, 200);
  assert.equal(count.body.count, 1);
  assert.equal(count.body.typeTotal, 1);
  assert.equal(count.body.grandTotal, 1);

  const listed = await invoke(routes, {
    routePath: "/api/quotes",
    query: {
      note_type: "quote",
      quote: "route",
      tags: "sqlite",
      limit: "10",
      offset: "0",
    },
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].note_title, "Portable note");
  assert.equal(listed.body[0].tags, "portable, sqlite");

  const updated = await invoke(routes, {
    method: "PUT",
    routePath: "/api/quotes/:id",
    params: { id: String(created.body.id) },
    body: {
      note_text: "SQLite route coverage updated",
      note_title: "Portable note updated",
      comment: "updated from route test",
      score: "6",
      tags: "sqlite, updated",
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.note_text, "SQLite route coverage updated");
  assert.equal(updated.body.note_title, "Portable note updated");
  assert.equal(updated.body.score, "6");
  assert.equal(updated.body.tags, "sqlite, updated");

  const fetched = await invoke(routes, {
    routePath: "/api/quotes/:id",
    params: { id: String(created.body.id) },
  });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.comment, "updated from route test");
  assert.equal(fetched.body.tags, "sqlite, updated");

  const rows = await pool.query("SELECT COUNT(*) AS count FROM notes");
  assert.equal(rows.rows[0].count, 1);

  const deleted = await invoke(routes, {
    method: "DELETE",
    routePath: "/api/quotes/:id",
    params: { id: String(created.body.id) },
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.message, "Quote deleted successfully");

  const afterDelete = await pool.query("SELECT COUNT(*) AS count FROM notes");
  assert.equal(afterDelete.rows[0].count, 0);
});

test("SQLite quote routes support training year filters and ordering", async (t) => {
  const { routes } = await makeSqliteQuoteRoutes(t);

  const created = await invoke(routes, {
    method: "POST",
    routePath: "/api/quotes",
    body: {
      note_text: "Training log",
      note_title: "June session",
      note_type: "training",
      note_date: "2026-06-15",
      sourceType: "WORKOUT",
      tags: "2026, June",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.note_type, "training");

  const years = await invoke(routes, { routePath: "/api/quotes/training-years" });
  assert.equal(years.status, 200);
  assert.deepEqual(years.body, { years: [2026] });

  const listed = await invoke(routes, {
    routePath: "/api/quotes",
    query: { note_type: "training", limit: "10", offset: "0" },
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].note_title, "June session");
});
