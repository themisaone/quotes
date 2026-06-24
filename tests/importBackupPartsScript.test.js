const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  collectPartFiles,
  normalizeImportUrl,
  parseArgs,
  postBackupPart,
  summarizeStats,
} = require("../scripts/import-json-backup-parts");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-import-parts-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
}

function backupWithQuotes(count = 1) {
  return {
    version: "2.0",
    data: {
      authors: [],
      sources: [],
      tags: [],
      noteTypes: [{ value: "quote", label: "Quotes", icon: "Q", behavior: "quote" }],
      quotes: Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        note_text: `Note ${index + 1}`,
        note_type: "quote",
      })),
    },
  };
}

test("collectPartFiles orders numeric part files and skips unsplit JSON by default", (t) => {
  const dir = tempDir(t);
  const part1 = path.join(dir, "backup_1.json");
  const part2 = path.join(dir, "backup_2.json");
  const part10 = path.join(dir, "backup_10.json");
  writeJson(path.join(dir, "backup.json"), backupWithQuotes());
  writeJson(part10, backupWithQuotes());
  writeJson(part2, backupWithQuotes());
  writeJson(part1, backupWithQuotes());

  assert.deepEqual(
    collectPartFiles([dir]).map((file) => path.basename(file)),
    ["backup_1.json", "backup_2.json", "backup_10.json"],
  );
});

test("collectPartFiles rejects explicit unsplit files unless requested", (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "backup.json");
  writeJson(file, backupWithQuotes());

  assert.throws(
    () => collectPartFiles([file]),
    /does not look like a split part/,
  );
  assert.deepEqual(collectPartFiles([file], { includeAllJson: true }), [file]);
});

test("normalizeImportUrl accepts base app URLs and full import URLs", () => {
  assert.equal(
    normalizeImportUrl("http://localhost:4000"),
    "http://localhost:4000/api/import/json",
  );
  assert.equal(
    normalizeImportUrl("localhost:4000/api/import/json"),
    "http://localhost:4000/api/import/json",
  );
});

test("parseArgs accepts separated option values", () => {
  const parsed = parseArgs([
    "node",
    "script",
    "/tmp/parts",
    "--url",
    "http://localhost:4000",
    "--from",
    "2",
    "--to",
    "4",
  ]);

  assert.deepEqual(parsed.inputs, ["/tmp/parts"]);
  assert.equal(parsed.url, "http://localhost:4000");
  assert.equal(parsed.from, 2);
  assert.equal(parsed.to, 4);
});

test("postBackupPart sends backup data and replace option to import endpoint", async (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, "backup_1.json");
  writeJson(file, backupWithQuotes(2));

  const calls = [];
  const result = await postBackupPart(file, {
    importUrl: "http://localhost:4000/api/import/json",
    replaceExisting: true,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            success: true,
            stats: {
              authors: { created: 0, skipped: 0 },
              sources: { created: 0, skipped: 0 },
              tags: { created: 0, skipped: 0 },
              quotes: { created: 2, skipped: 0 },
            },
          });
        },
      };
    },
  });

  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:4000/api/import/json");
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.options.replaceExisting, true);
  assert.equal(payload.data.quotes.length, 2);
  assert.deepEqual(payload.data.noteTypes, [{ value: "quote", label: "Quotes", icon: "Q", behavior: "quote" }]);
});

test("summarizeStats reports the important counters", () => {
  assert.equal(
    summarizeStats({
      authors: { created: 1, skipped: 2 },
      sources: { created: 3, skipped: 4 },
      tags: { created: 5, skipped: 6 },
      quotes: { created: 7, skipped: 8 },
    }),
    "notes 7 created, 8 skipped | authors 1/2 | sources 3/4 | tags 5/6",
  );
});
