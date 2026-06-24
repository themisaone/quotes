const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runMigrations } = require("../migrations/run-migrations");
const { createSqlitePool } = require("../src/db/sqlite");
const { registerQuoteBulkRoutes } = require("../src/routes/quoteBulk");

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-sqlite-bulk-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

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

function makeFileStorage({
  copyAttachmentFile = (value) => value,
} = {}) {
  return {
    copied: [],
    deleted: [],
    copyAttachmentFile(value, oldKey, newKey) {
      this.copied.push([value, oldKey, newKey]);
      return copyAttachmentFile(value, oldKey, newKey);
    },
    deleteAttachment(value) {
      this.deleted.push(value);
    },
  };
}

async function makeSqliteBulkRoutes(t, { fileStorage = makeFileStorage() } = {}) {
  const dir = makeTempDir(t);
  const pool = createSqlitePool({ filename: path.join(dir, "archive.sqlite") });
  t.after(() => pool.end());
  await runMigrations({ pool, logger: silentLogger, quietWhenNoPending: true });

  const routes = makeRouteCollector({
    pool,
    fileStorage,
    getAllowedTypes: () => ["quote", "note"],
  });

  return { pool, routes, fileStorage };
}

async function insertNote(pool, fields = {}) {
  const result = await pool.query(
    `INSERT INTO notes
       (note_text, note_title, note_type, type, thumbnail, attachment_full, attachment_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      fields.note_text || "note text",
      fields.note_title || null,
      fields.note_type || "quote",
      fields.type || "BOOK",
      fields.thumbnail || "",
      fields.attachment_full || "",
      fields.attachment_type || "image",
    ],
  );
  return result.rows[0].id;
}

async function getTagNamesForNote(pool, noteId) {
  const result = await pool.query(
    `SELECT t.name
     FROM tags t
     JOIN note_tags nt ON nt.tag_id = t.id
     WHERE nt.note_id = $1
     ORDER BY t.name`,
    [noteId],
  );
  return result.rows.map((row) => row.name);
}

async function addTagToNote(pool, noteId, name, type = "quote") {
  const tag = await pool.query(
    `INSERT INTO tags (name, type)
     VALUES ($1, $2)
     RETURNING id`,
    [name, type],
  );
  await pool.query(
    "INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)",
    [noteId, tag.rows[0].id],
  );
  return tag.rows[0].id;
}

test("SQLite bulk routes return filtered IDs and explicit counts", async (t) => {
  const { pool, routes } = await makeSqliteBulkRoutes(t);
  const quoteId = await insertNote(pool, {
    note_text: "bulk quote",
    note_type: "quote",
  });
  const noteId = await insertNote(pool, {
    note_text: "bulk note",
    note_type: "note",
  });

  const ids = await invoke(routes, {
    routePath: "/api/quotes/ids",
    body: { filters: { note_type: "quote", search: "bulk" } },
  });
  assert.equal(ids.status, 200);
  assert.deepEqual(ids.body, { ids: [quoteId] });

  const explicitCount = await invoke(routes, {
    routePath: "/api/quotes/bulk-count",
    body: { noteIds: [String(quoteId), "bad", noteId] },
  });
  assert.equal(explicitCount.status, 200);
  assert.deepEqual(explicitCount.body, { count: 2 });
});

test("SQLite bulk routes add and remove tags", async (t) => {
  const { pool, routes } = await makeSqliteBulkRoutes(t);
  const firstId = await insertNote(pool, { note_text: "first quote" });
  const secondId = await insertNote(pool, { note_text: "second quote" });

  const tagged = await invoke(routes, {
    routePath: "/api/quotes/bulk-tag",
    body: {
      noteIds: [firstId, secondId],
      tagName: "review",
      noteType: "quote",
    },
  });
  assert.equal(tagged.status, 200);
  assert.deepEqual(tagged.body, {
    count: 2,
    total: 2,
    message: "Tagged 2 quotes (0 already had this tag)",
  });
  assert.deepEqual(await getTagNamesForNote(pool, firstId), ["review"]);
  assert.deepEqual(await getTagNamesForNote(pool, secondId), ["review"]);

  const untagged = await invoke(routes, {
    routePath: "/api/quotes/bulk-untag",
    body: {
      noteIds: [firstId],
      tagName: "review",
      noteType: "quote",
    },
  });
  assert.equal(untagged.status, 200);
  assert.deepEqual(untagged.body, {
    count: 1,
    total: 1,
    message: "Removed tag from 1 notes (0 didn't have this tag)",
  });
  assert.deepEqual(await getTagNamesForNote(pool, firstId), []);
  assert.deepEqual(await getTagNamesForNote(pool, secondId), ["review"]);
});

test("SQLite bulk delete removes notes and cleans all attachment refs after commit", async (t) => {
  const { pool, routes, fileStorage } = await makeSqliteBulkRoutes(t);
  const deleteId = await insertNote(pool, {
    note_text: "delete me",
    thumbnail: "thumb-1",
    attachment_full: "full-1",
  });
  const keepId = await insertNote(pool, {
    note_text: "keep me",
    thumbnail: "thumb-2",
    attachment_full: "full-2",
  });

  await pool.query(
    `INSERT INTO note_attachments
       (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
     VALUES
       ($1, 0, $2, $3, 'image', 'file', 'main.jpg'),
       ($1, 1, $4, $5, 'pdf', 'file', 'extra.pdf')`,
    [deleteId, "thumb-1", "full-1", "extra-thumb-1", "extra-full-1"],
  );
  await pool.query(
    `INSERT INTO note_attachments
       (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
     VALUES ($1, 0, $2, $3, 'image', 'file', 'keep.jpg')`,
    [keepId, "thumb-2", "full-2"],
  );

  const deleted = await invoke(routes, {
    routePath: "/api/quotes/bulk-delete",
    body: { noteIds: [deleteId, keepId], excludeIds: [keepId] },
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, { count: 1, message: "Deleted 1 notes" });
  assert.deepEqual(fileStorage.deleted, [
    "thumb-1",
    "full-1",
    "extra-thumb-1",
    "extra-full-1",
  ]);

  const notes = await pool.query("SELECT id FROM notes ORDER BY id");
  assert.deepEqual(notes.rows.map((row) => row.id), [keepId]);

  const attachments = await pool.query(
    "SELECT note_id, attachment_full FROM note_attachments ORDER BY note_id, position",
  );
  assert.deepEqual(attachments.rows, [
    { note_id: keepId, attachment_full: "full-2" },
  ]);
});

test("SQLite bulk duplicate copies notes, attachments, and tags", async (t) => {
  const fileStorage = makeFileStorage({
    copyAttachmentFile(value, oldKey, newKey) {
      return value ? `${value}:copy:${newKey}` : value;
    },
  });
  const { pool, routes } = await makeSqliteBulkRoutes(t, { fileStorage });
  const originalId = await insertNote(pool, {
    note_text: "duplicate source",
    note_title: "source title",
    thumbnail: "thumb-old",
    attachment_full: "full-old",
  });
  await addTagToNote(pool, originalId, "copy-me");
  await pool.query(
    `INSERT INTO note_attachments
       (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
     VALUES
       ($1, 0, $2, $3, 'image', 'file', 'main.jpg'),
       ($1, 1, $4, $5, 'pdf', 'file', 'extra.pdf')`,
    [originalId, "thumb-old", "full-old", "extra-thumb", "extra-full"],
  );

  const duplicated = await invoke(routes, {
    routePath: "/api/quotes/bulk-duplicate",
    body: { noteIds: [originalId] },
  });

  assert.equal(duplicated.status, 200);
  assert.deepEqual(duplicated.body, {
    count: 1,
    message: "Duplicated 1 note",
  });

  const notes = await pool.query("SELECT * FROM notes ORDER BY id");
  assert.equal(notes.rows.length, 2);
  const duplicate = notes.rows.find((row) => row.id !== originalId);
  assert.equal(duplicate.note_text, "duplicate source");
  assert.equal(duplicate.note_title, "source title");
  assert.equal(duplicate.thumbnail, `thumb-old:copy:${duplicate.id}`);
  assert.equal(duplicate.attachment_full, `full-old:copy:${duplicate.id}`);
  assert.deepEqual(await getTagNamesForNote(pool, duplicate.id), ["copy-me"]);

  const attachments = await pool.query(
    `SELECT position, thumbnail, attachment_full, attachment_type, filename
     FROM note_attachments
     WHERE note_id = $1
     ORDER BY position`,
    [duplicate.id],
  );
  assert.deepEqual(attachments.rows, [
    {
      position: 0,
      thumbnail: `thumb-old:copy:${duplicate.id}`,
      attachment_full: `full-old:copy:${duplicate.id}`,
      attachment_type: "image",
      filename: "main.jpg",
    },
    {
      position: 1,
      thumbnail: `extra-thumb:copy:${duplicate.id}_a1`,
      attachment_full: `extra-full:copy:${duplicate.id}_a1`,
      attachment_type: "pdf",
      filename: "extra.pdf",
    },
  ]);
  assert.deepEqual(fileStorage.copied, [
    ["thumb-old", originalId, duplicate.id],
    ["full-old", originalId, duplicate.id],
    ["extra-thumb", `${originalId}_a1`, `${duplicate.id}_a1`],
    ["extra-full", `${originalId}_a1`, `${duplicate.id}_a1`],
  ]);
});

test("SQLite bulk split creates new notes from extra attachments", async (t) => {
  const fileStorage = makeFileStorage({
    copyAttachmentFile(value, oldKey, newKey) {
      return value ? `${value}:split:${newKey}` : value;
    },
  });
  const { pool, routes } = await makeSqliteBulkRoutes(t, { fileStorage });
  const originalId = await insertNote(pool, {
    note_text: "split source",
    note_title: "split title",
    thumbnail: "main-thumb",
    attachment_full: "main-full",
  });
  await addTagToNote(pool, originalId, "split-me");
  await pool.query(
    `INSERT INTO note_attachments
       (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
     VALUES
       ($1, 0, $2, $3, 'image', 'file', 'main.jpg'),
       ($1, 1, $4, $5, 'pdf', 'file', 'extra.pdf')`,
    [originalId, "main-thumb", "main-full", "extra-thumb", "extra-full"],
  );

  const split = await invoke(routes, {
    routePath: "/api/quotes/bulk-split",
    body: { noteIds: [originalId] },
  });

  assert.equal(split.status, 200);
  assert.deepEqual(split.body, {
    splitCount: 1,
    newNotes: 1,
    message: "Split 1 note → created 1 new note",
  });

  const notes = await pool.query("SELECT * FROM notes ORDER BY id");
  assert.equal(notes.rows.length, 2);
  const original = notes.rows.find((row) => row.id === originalId);
  const created = notes.rows.find((row) => row.id !== originalId);
  assert.equal(original.attachment_full, "main-full");
  assert.equal(created.note_text, "split source");
  assert.equal(created.note_title, "split title");
  assert.equal(created.thumbnail, "extra-thumb");
  assert.equal(created.attachment_full, `extra-full:split:${created.id}`);
  assert.deepEqual(await getTagNamesForNote(pool, created.id), ["split-me"]);

  const originalAttachments = await pool.query(
    "SELECT position, attachment_full FROM note_attachments WHERE note_id = $1 ORDER BY position",
    [originalId],
  );
  assert.deepEqual(originalAttachments.rows, [
    { position: 0, attachment_full: "main-full" },
  ]);

  const createdAttachments = await pool.query(
    `SELECT position, thumbnail, attachment_full, attachment_type, filename
     FROM note_attachments
     WHERE note_id = $1
     ORDER BY position`,
    [created.id],
  );
  assert.deepEqual(createdAttachments.rows, [
    {
      position: 0,
      thumbnail: "extra-thumb",
      attachment_full: `extra-full:split:${created.id}`,
      attachment_type: "pdf",
      filename: "extra.pdf",
    },
  ]);
  assert.deepEqual(fileStorage.copied, [
    ["extra-full", `${originalId}_a1`, String(created.id)],
  ]);
  assert.deepEqual(fileStorage.deleted, ["extra-thumb", "extra-full"]);
});
