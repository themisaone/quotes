const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runMigrations } = require("../migrations/run-migrations");
const { createSqlitePool } = require("../src/db/sqlite");
const { registerMaintenanceRoutes } = require("../src/routes/maintenance");

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-sqlite-maintenance-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeRouteCollector({ pool, attachmentsDir, settingsFile, modesState }) {
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
    fsImpl: fs,
    getSettingsFile: () => settingsFile,
    modesState,
    readLocalConfig: () => ({ vaultPath: path.dirname(attachmentsDir) }),
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

async function makeSqliteMaintenanceRoutes(t) {
  const dir = makeTempDir(t);
  const attachmentsDir = path.join(dir, "attachments");
  const settingsFile = path.join(dir, "config", "settings.json");
  const modesState = { ALL: ["quote", "historical", "job"] };
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify({
    noteTypes: [
      { value: "quote", label: "Quotes" },
      { value: "historical", label: "Historical" },
      { value: "job", label: "Job" },
    ],
  }));
  const pool = createSqlitePool({ filename: path.join(dir, "archive.sqlite") });
  t.after(() => pool.end());
  await runMigrations({ pool, logger: silentLogger, quietWhenNoPending: true });
  return {
    attachmentsDir,
    pool,
    routes: makeRouteCollector({ pool, attachmentsDir, settingsFile, modesState }),
    settingsFile,
  };
}

test("SQLite maintenance health reports aligned note types", async (t) => {
  const { pool, routes } = await makeSqliteMaintenanceRoutes(t);

  await pool.query(
    "INSERT INTO notes (note_text, note_type) VALUES ($1, $2), ($3, $4)",
    ["quote note", "quote", "job note", "job"],
  );

  const response = await invoke(routes, {
    method: "GET",
    routePath: "/api/maintenance/health",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.backend, "sqlite");
  assert.deepEqual(response.body.mismatches, {
    modesMissingFromSettings: [],
    dbMissingFromSettings: [],
    settingsMissingFromModes: [],
    dbMissingFromModes: [],
  });
  assert.deepEqual(
    response.body.countsByNoteType.map((row) => [row.noteType, row.count]),
    [["job", 1], ["quote", 1]],
  );
});

test("SQLite maintenance prune removes unused authors, sources, and tags", async (t) => {
  const { pool, routes } = await makeSqliteMaintenanceRoutes(t);

  const usedAuthor = await pool.query(
    "INSERT INTO authors (name) VALUES ($1) RETURNING id",
    ["used author"],
  );
  const unusedAuthor = await pool.query(
    "INSERT INTO authors (name) VALUES ($1) RETURNING id",
    ["unused author"],
  );
  const usedSource = await pool.query(
    "INSERT INTO sources (name) VALUES ($1) RETURNING id",
    ["used source"],
  );
  const unusedSource = await pool.query(
    "INSERT INTO sources (name) VALUES ($1) RETURNING id",
    ["unused source"],
  );
  const usedTag = await pool.query(
    "INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id",
    ["used tag", "quote"],
  );
  const unusedTag = await pool.query(
    "INSERT INTO tags (name, type) VALUES ($1, $2) RETURNING id",
    ["unused tag", "quote"],
  );
  const note = await pool.query(
    "INSERT INTO notes (note_text, author_id, source_id) VALUES ($1, $2, $3) RETURNING id",
    ["kept note", usedAuthor.rows[0].id, usedSource.rows[0].id],
  );
  await pool.query(
    "INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)",
    [note.rows[0].id, usedTag.rows[0].id],
  );

  const dryRunResponse = await invoke(routes, {
    routePath: "/api/maintenance/prune-unused-entities",
  });

  assert.equal(dryRunResponse.status, 200);
  assert.deepEqual(dryRunResponse.body, {
    ok: true,
    dryRun: true,
    authors: [{ id: unusedAuthor.rows[0].id, name: "unused author" }],
    sources: [{ id: unusedSource.rows[0].id, name: "unused source" }],
    tags: [{ id: unusedTag.rows[0].id, name: "unused tag", type: "quote" }],
    total: 3,
    authorsRemoved: 0,
    sourcesRemoved: 0,
    tagsRemoved: 0,
    authorsWouldRemove: 1,
    sourcesWouldRemove: 1,
    tagsWouldRemove: 1,
  });

  const authorsAfterDryRun = await pool.query("SELECT id FROM authors ORDER BY id");
  assert.deepEqual(
    authorsAfterDryRun.rows.map((row) => row.id),
    [usedAuthor.rows[0].id, unusedAuthor.rows[0].id],
  );

  const response = await invoke(routes, {
    routePath: "/api/maintenance/prune-unused-entities",
    body: { dryRun: false },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    dryRun: false,
    authors: [{ id: unusedAuthor.rows[0].id, name: "unused author" }],
    sources: [{ id: unusedSource.rows[0].id, name: "unused source" }],
    tags: [{ id: unusedTag.rows[0].id, name: "unused tag", type: "quote" }],
    total: 3,
    authorsRemoved: 1,
    sourcesRemoved: 1,
    tagsRemoved: 1,
    authorsWouldRemove: 0,
    sourcesWouldRemove: 0,
    tagsWouldRemove: 0,
  });

  const remainingAuthors = await pool.query("SELECT id FROM authors ORDER BY id");
  assert.deepEqual(remainingAuthors.rows.map((row) => row.id), [usedAuthor.rows[0].id]);
  const remainingSources = await pool.query("SELECT id FROM sources ORDER BY id");
  assert.deepEqual(remainingSources.rows.map((row) => row.id), [usedSource.rows[0].id]);
  const remainingTags = await pool.query("SELECT id FROM tags ORDER BY id");
  assert.deepEqual(remainingTags.rows.map((row) => row.id), [usedTag.rows[0].id]);

  assert.equal(unusedAuthor.rows[0].id > 0, true);
  assert.equal(unusedSource.rows[0].id > 0, true);
  assert.equal(unusedTag.rows[0].id > 0, true);
});

test("SQLite maintenance rehome returns a dry-run attachment folder drift plan", async (t) => {
  const { attachmentsDir, pool, routes } = await makeSqliteMaintenanceRoutes(t);
  fs.mkdirSync(path.join(attachmentsDir, "quote"), { recursive: true });
  fs.writeFileSync(path.join(attachmentsDir, "quote", "7.pdf"), "pdf");

  const note = await pool.query(
    `INSERT INTO notes (note_text, note_type, attachment_full)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ["historical note", "historical", "file:quote/7.pdf:application/pdf"],
  );
  await pool.query(
    `INSERT INTO note_attachments
       (note_id, position, attachment_full, attachment_type, storage_type, filename)
     VALUES ($1, 0, $2, 'pdf', 'file', '7.pdf')`,
    [note.rows[0].id, "file:quote/7.pdf:application/pdf"],
  );

  const response = await invoke(routes, {
    routePath: "/api/maintenance/rehome-attachments",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.dryRun, true);
  assert.equal(response.body.totalFileRefs, 1);
  assert.equal(response.body.movableCount, 1);
  assert.deepEqual(response.body.items.map((item) => ({
    noteId: item.noteId,
    noteType: item.noteType,
    currentPath: item.currentPath,
    targetPath: item.targetPath,
    targetRef: item.targetRef,
    status: item.status,
  })), [
    {
      noteId: note.rows[0].id,
      noteType: "historical",
      currentPath: "quote/7.pdf",
      targetPath: "historical/7.pdf",
      targetRef: "file:historical/7.pdf:application/pdf",
      status: "movable",
    },
  ]);
});

test("SQLite maintenance rehome applies movable attachment folder drift", async (t) => {
  const { attachmentsDir, pool, routes } = await makeSqliteMaintenanceRoutes(t);
  const sourcePath = path.join(attachmentsDir, "quote", "7.pdf");
  const targetPath = path.join(attachmentsDir, "historical", "7.pdf");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "pdf");

  const note = await pool.query(
    `INSERT INTO notes (note_text, note_type, attachment_full)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ["historical note", "historical", "file:quote/7.pdf:application/pdf"],
  );
  await pool.query(
    `INSERT INTO note_attachments
       (note_id, position, attachment_full, attachment_type, storage_type, filename)
     VALUES ($1, 0, $2, 'pdf', 'file', '7.pdf')`,
    [note.rows[0].id, "file:quote/7.pdf:application/pdf"],
  );

  const response = await invoke(routes, {
    routePath: "/api/maintenance/rehome-attachments",
    body: { dryRun: false },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.dryRun, false);
  assert.equal(response.body.applied.movedCount, 1);
  assert.equal(fs.existsSync(sourcePath), false);
  assert.equal(fs.existsSync(targetPath), true);

  const notes = await pool.query(
    "SELECT attachment_full FROM notes WHERE id = $1",
    [note.rows[0].id],
  );
  assert.equal(notes.rows[0].attachment_full, "file:historical/7.pdf:application/pdf");

  const attachments = await pool.query(
    "SELECT attachment_full FROM note_attachments WHERE note_id = $1",
    [note.rows[0].id],
  );
  assert.equal(attachments.rows[0].attachment_full, "file:historical/7.pdf:application/pdf");
});
