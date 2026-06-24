const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-split-backup-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("split-json-backup preserves note type definitions in every part", (t) => {
  const dir = tempDir(t);
  const input = path.join(dir, "backup.json");
  const outDir = path.join(dir, "parts");
  const backup = {
    version: "2.0",
    exportedAt: "2026-06-24T00:00:00.000Z",
    noteTypeFilter: "all",
    counts: { authors: 1, sources: 1, tags: 1, quotes: 1 },
    data: {
      authors: [{ id: 1, name: "Ada" }],
      sources: [{ id: 1, name: "Notebook", type: "BOOK" }],
      tags: [{ id: 1, name: "portable", type: "quote" }],
      noteTypes: [
        { value: "quote", label: "Quotes", icon: "Q", behavior: "quote" },
        { value: "job", label: "Job Notes", icon: "J", behavior: "generic" },
      ],
      quotes: [{
        id: 1,
        note_text: "Keep note types",
        note_type: "job",
        tag_objects: [{ id: 1, name: "portable", type: "quote" }],
      }],
    },
  };
  fs.writeFileSync(input, JSON.stringify(backup), "utf8");

  const result = spawnSync(
    process.execPath,
    ["scripts/split-json-backup.js", input, outDir, "--mb=1"],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const part = JSON.parse(fs.readFileSync(path.join(outDir, "backup_1.json"), "utf8"));
  assert.deepEqual(part.data.noteTypes, backup.data.noteTypes);
  assert.equal(part.data.quotes.length, 1);
});
