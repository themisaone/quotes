const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const fileStorage = require("../src/fileStorage");
const { migrateTable, parseArgs } = require("../scripts/migrate-entity-images-to-vault");

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("migration dry-run reports candidates without writing files or updating rows", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "entity-migration-"));
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 7, name: "Source", image: PNG_DATA_URL }] };
    },
  };
  fileStorage.setAttachmentsDirAbsolute(path.join(tmpRoot, "attachments"));

  try {
    const result = await migrateTable(pool, "sources", "sources", true, { log() {} });
    assert.deepEqual(result, { migrated: 1, skipped: 0, total: 1 });
    assert.equal(calls.length, 1);
    assert.equal(fs.existsSync(path.join(tmpRoot, "attachments", "sources", "7.png")), false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fileStorage.setAttachmentsDirAbsolute(null);
  }
});

test("migration argument parsing is dry-run unless --apply is explicit", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), { apply: false, dryRun: true });
  assert.deepEqual(parseArgs(["--apply"]), { apply: true, dryRun: false });
});
