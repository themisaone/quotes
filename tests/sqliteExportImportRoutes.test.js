const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runMigrations } = require("../migrations/run-migrations");
const { createSqlitePool } = require("../src/db/sqlite");
const { registerExportImportRoutes } = require("../src/routes/exportImport");

process.on("warning", (warning) => {
  if (warning.name !== "ExperimentalWarning" || !/SQLite/.test(warning.message)) {
    throw warning;
  }
});

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
}

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-sqlite-export-import-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeFileStorage(attachmentsDir) {
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
    processForStorage(value) {
      return value || null;
    },
    deleteAttachment() {},
  };
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

async function makeSqliteExportImportRoutes(t) {
  const dir = makeTempDir(t);
  const attachmentsDir = path.join(dir, "attachments");
  const settingsFile = path.join(dir, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ externalStorageThreshold: 1 }));

  const pool = createSqlitePool({ filename: path.join(dir, "archive.sqlite") });
  t.after(() => pool.end());
  await runMigrations({ pool, logger: silentLogger, quietWhenNoPending: true });

  return {
    attachmentsDir,
    pool,
    settingsFile,
    routes: makeRouteCollector({
      pool,
      fileStorage: makeFileStorage(attachmentsDir),
      getSettingsFile: () => settingsFile,
    }),
  };
}

test("SQLite JSON export streams notes with tag objects", async (t) => {
  const { pool, routes } = await makeSqliteExportImportRoutes(t);

  const author = await pool.query(
    "INSERT INTO authors (name) VALUES ($1) RETURNING id",
    ["Ada"],
  );
  const source = await pool.query(
    "INSERT INTO sources (name, type) VALUES ($1, $2) RETURNING id",
    ["Notebook", "BOOK"],
  );
  const note = await pool.query(
    `INSERT INTO notes
       (note_text, note_title, author_id, source_id, note_type, type, note_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    ["Exported note", "Export title", author.rows[0].id, source.rows[0].id, "quote", "BOOK", "2026-06-24"],
  );
  const tag = await pool.query(
    "INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id",
    ["portable", "quote"],
  );
  await pool.query(
    "INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)",
    [note.rows[0].id, tag.rows[0].id],
  );
  await pool.query(
    `INSERT INTO note_attachments
       (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
     VALUES ($1, 0, $2, $3, 'pdf', 'base64', 'export.pdf')`,
    [note.rows[0].id, "data:image/png;base64,thumb", "data:application/pdf;base64,full"],
  );
  const unrelatedAuthor = await pool.query(
    "INSERT INTO authors (name) VALUES ($1) RETURNING id",
    ["Grace"],
  );
  const unrelatedSource = await pool.query(
    "INSERT INTO sources (name, type) VALUES ($1, $2) RETURNING id",
    ["Job board", "WEB"],
  );
  const unrelatedNote = await pool.query(
    `INSERT INTO notes
       (note_text, note_title, author_id, source_id, note_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    ["Unrelated job", "Job title", unrelatedAuthor.rows[0].id, unrelatedSource.rows[0].id, "job"],
  );
  const unrelatedTag = await pool.query(
    "INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id",
    ["job-only", "job"],
  );
  await pool.query(
    "INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)",
    [unrelatedNote.rows[0].id, unrelatedTag.rows[0].id],
  );

  const res = await invoke(routes, {
    routePath: "/api/export/json",
    query: { note_type: "quote" },
  });
  const parsed = JSON.parse(res.chunks.join(""));

  assert.equal(res.statusCode, 200);
  assert.equal(parsed.noteTypeFilter, "quote");
  assert.deepEqual(parsed.counts, {
    authors: 1,
    sources: 1,
    tags: 1,
    quotes: 1,
  });
  assert.deepEqual(parsed.data.authors.map((row) => row.name), ["Ada"]);
  assert.deepEqual(parsed.data.sources.map((row) => row.name), ["Notebook"]);
  assert.deepEqual(parsed.data.tags.map((row) => row.name), ["portable"]);
  assert.equal(parsed.data.quotes.length, 1);
  assert.equal(parsed.data.quotes[0].note_text, "Exported note");
  assert.equal(parsed.data.quotes[0].author_name, "Ada");
  assert.equal(parsed.data.quotes[0].source_name, "Notebook");
  assert.deepEqual(parsed.data.quotes[0].attachments, [{
    position: 0,
    thumbnail: "data:image/png;base64,thumb",
    attachment_full: "data:application/pdf;base64,full",
    attachment_type: "pdf",
    filename: "export.pdf",
  }]);
  assert.deepEqual(parsed.data.quotes[0].tag_objects, [
    { id: tag.rows[0].id, name: "portable", type: "quote" },
  ]);
});

test("SQLite JSON import creates authors, sources, tags, notes, and note tags", async (t) => {
  const { pool, routes } = await makeSqliteExportImportRoutes(t);

  const res = await invoke(routes, {
    method: "POST",
    routePath: "/api/import/json",
    body: {
      data: {
        authors: [{ name: "Ada", image: "", description: "math" }],
        sources: [{ name: "Notebook", type: "BOOK", image: "" }],
        tags: [{ name: "portable", type: "quote", created_at: "2026-06-24 12:00:00" }],
        quotes: [{
          id: 42,
          note_text: "Imported note",
          note_title: "Imported title",
          author_name: "Ada",
          source_name: "Notebook",
          type: "BOOK",
          comment: "from backup",
          note_type: "quote",
          note_date: "2026-06-24T12:00:00.000Z",
          score: "5",
          attachment_type: null,
          created_at: "2026-06-24 12:00:00",
          updated_at: "2026-06-24 12:00:00",
          tag_objects: [{ name: "portable", type: "quote" }],
          attachments: [{
            position: 0,
            thumbnail: "data:image/png;base64,thumb",
            attachment_full: "data:application/pdf;base64,full",
            attachment_type: "pdf",
            filename: "import.pdf",
          }],
        }],
      },
      options: {},
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.stats, {
    authors: { created: 1, updated: 0, skipped: 0 },
    sources: { created: 1, updated: 0, skipped: 0 },
    tags: { created: 1, updated: 0, skipped: 0 },
    quotes: { created: 1, updated: 0, skipped: 0 },
    errors: [],
  });

  const notes = await pool.query(
    "SELECT id, note_text, note_title, note_date, score FROM notes ORDER BY id",
  );
  assert.deepEqual(notes.rows, [{
    id: 42,
    note_text: "Imported note",
    note_title: "Imported title",
    note_date: "2026-06-24",
    score: "5",
  }]);

  const noteTags = await pool.query(
    `SELECT t.name, t.type
     FROM tags t
     JOIN note_tags nt ON nt.tag_id = t.id
     WHERE nt.note_id = $1`,
    [42],
  );
  assert.deepEqual(noteTags.rows, [{ name: "portable", type: "quote" }]);

  const attachments = await pool.query(
    `SELECT position, thumbnail, attachment_full, attachment_type, filename
     FROM note_attachments
     WHERE note_id = $1`,
    [42],
  );
  assert.deepEqual(attachments.rows, [{
    position: 0,
    thumbnail: "data:image/png;base64,thumb",
    attachment_full: "data:application/pdf;base64,full",
    attachment_type: "pdf",
    filename: "import.pdf",
  }]);
});

test("SQLite JSON import rejects notes whose type is not configured or defined in the backup", async (t) => {
  const { pool, routes, settingsFile } = await makeSqliteExportImportRoutes(t);

  fs.writeFileSync(settingsFile, JSON.stringify({
    externalStorageThreshold: 1,
    noteTypes: [{ value: "quote", label: "Quotes", icon: "💬", behavior: "quote" }],
  }));

  const res = await invoke(routes, {
    method: "POST",
    routePath: "/api/import/json",
    body: {
      data: {
        authors: [],
        sources: [],
        tags: [],
        quotes: [{
          id: 77,
          note_text: "Job note",
          note_type: "job",
          created_at: "2026-06-24 12:00:00",
          updated_at: "2026-06-24 12:00:00",
        }],
      },
      options: {},
    },
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    error: "Import references note types that are not configured",
    noteTypes: ["job"],
    details: "Add these note types in Options, or import a backup that includes note type definitions.",
  });

  const notes = await pool.query("SELECT note_type FROM notes WHERE id = $1", [77]);
  assert.deepEqual(notes.rows, []);
});

test("SQLite JSON import adds note types that are defined in the backup", async (t) => {
  const { pool, routes, settingsFile } = await makeSqliteExportImportRoutes(t);

  fs.writeFileSync(settingsFile, JSON.stringify({
    externalStorageThreshold: 1,
    noteTypes: [{ value: "quote", label: "Quotes", icon: "💬", behavior: "quote" }],
  }));

  const res = await invoke(routes, {
    method: "POST",
    routePath: "/api/import/json",
    body: {
      data: {
        authors: [],
        sources: [],
        tags: [],
        noteTypes: [{
          value: "job",
          label: "Job Notes",
          icon: "📌",
          behavior: "generic",
          defaultDisplayMode: "list-pane",
        }],
        quotes: [{
          id: 77,
          note_text: "Job note",
          note_type: "job",
          created_at: "2026-06-24 12:00:00",
          updated_at: "2026-06-24 12:00:00",
        }],
      },
      options: {},
    },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.noteTypesAdded, ["job"]);
  assert.deepEqual(res.body.stats.errors, []);
  assert.deepEqual(res.body.stats.quotes, { created: 1, updated: 0, skipped: 0 });

  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.deepEqual(settings.noteTypes.map((type) => type.value), ["quote", "job"]);
  assert.deepEqual(settings.noteTypes[1], {
    value: "job",
    label: "Job Notes",
    icon: "📌",
    behavior: "generic",
    defaultDisplayMode: "list-pane",
  });

  const notes = await pool.query("SELECT note_type FROM notes WHERE id = $1", [77]);
  assert.deepEqual(notes.rows, [{ note_type: "job" }]);
});

test("SQLite JSON import replaceExisting updates existing metadata", async (t) => {
  const { pool, routes } = await makeSqliteExportImportRoutes(t);

  await pool.query(
    "INSERT INTO authors (name, image, description) VALUES ($1, $2, $3)",
    ["Ada", "old-author.png", "old"],
  );
  await pool.query(
    "INSERT INTO sources (name, type, image) VALUES ($1, $2, $3)",
    ["Notebook", "BOOK", "old-source.png"],
  );
  await pool.query(
    "INSERT INTO tags (name, type, created_at) VALUES ($1, $2, $3)",
    ["portable", "quote", "2025-01-01 00:00:00"],
  );

  const res = await invoke(routes, {
    method: "POST",
    routePath: "/api/import/json",
    body: {
      data: {
        authors: [{ name: "Ada", image: "new-author.png", description: "new" }],
        sources: [{ name: "Notebook", type: "ARTICLE", image: "new-source.png" }],
        tags: [{ name: "portable", type: "quote", created_at: "2026-06-24 12:00:00" }],
        quotes: [],
      },
      options: { replaceExisting: true },
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.stats, {
    authors: { created: 0, updated: 1, skipped: 0 },
    sources: { created: 0, updated: 1, skipped: 0 },
    tags: { created: 0, updated: 1, skipped: 0 },
    quotes: { created: 0, updated: 0, skipped: 0 },
    errors: [],
  });

  const authors = await pool.query("SELECT image, description FROM authors WHERE name = $1", ["Ada"]);
  assert.deepEqual(authors.rows, [{ image: "new-author.png", description: "new" }]);

  const sources = await pool.query("SELECT type, image FROM sources WHERE name = $1", ["Notebook"]);
  assert.deepEqual(sources.rows, [{ type: "ARTICLE", image: "new-source.png" }]);

  const tags = await pool.query("SELECT created_at FROM tags WHERE name = $1 AND type = $2", ["portable", "quote"]);
  assert.deepEqual(tags.rows, [{ created_at: "2026-06-24 12:00:00" }]);
});
