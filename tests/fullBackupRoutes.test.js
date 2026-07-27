"use strict";

process.env.DB_BACKEND = "postgres";

const assert = require("node:assert/strict");
const test = require("node:test");
const { registerFullBackupRoutes } = require("../src/routes/fullBackup");

function makeRoutes(createBackup, logger = { error() {} }) {
  const routes = new Map();
  const app = {
    post(routePath, handler) {
      routes.set(`POST ${routePath}`, handler);
    },
  };
  registerFullBackupRoutes(app, { createBackup, logger });
  return routes;
}

async function invoke(handler) {
  const response = {
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
  await handler({}, response);
  return response;
}

test("POST /api/backup/full returns archive details", async () => {
  const routes = makeRoutes(async (options) => {
    assert.deepEqual(options, {});
    return {
      archivePath: "/app/backups/full.tar.gz",
      archiveBytes: 12345,
      manifest: {
        createdAt: "2026-07-27T12:00:00.000Z",
        database: { backend: "postgres" },
        attachments: { fileCount: 17 },
      },
    };
  });

  const response = await invoke(routes.get("POST /api/backup/full"));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    archivePath: "/app/backups/full.tar.gz",
    archiveBytes: 12345,
    createdAt: "2026-07-27T12:00:00.000Z",
    backend: "postgres",
    attachmentFiles: 17,
  });
});

test("POST /api/backup/full rejects a concurrent backup", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const routes = makeRoutes(async () => {
    await pending;
    return { archivePath: "/backup.tar.gz", manifest: {} };
  });
  const handler = routes.get("POST /api/backup/full");
  const first = invoke(handler);
  const second = await invoke(handler);
  assert.equal(second.statusCode, 409);
  assert.match(second.body.error, /already running/);
  release();
  await first;
});

test("POST /api/backup/full reports backup errors and releases its guard", async () => {
  let calls = 0;
  const routes = makeRoutes(async () => {
    calls += 1;
    throw new Error("pg_dump unavailable");
  });
  const handler = routes.get("POST /api/backup/full");

  const first = await invoke(handler);
  const second = await invoke(handler);
  assert.equal(first.statusCode, 500);
  assert.equal(second.statusCode, 500);
  assert.equal(first.body.error, "pg_dump unavailable");
  assert.equal(calls, 2);
});
