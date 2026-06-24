const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  applyAttachmentRehomePlan,
  buildAttachmentRehomePlan,
  getRehomeColumnSql,
  isSafeAttachmentPath,
  parseFileReference,
  replaceTopLevelFolder,
} = require("../src/attachmentRehome");

test("parseFileReference supports MIME and MIME-less file refs", () => {
  assert.deepEqual(parseFileReference("file:quote/7.pdf:application/pdf"), {
    relativePath: "quote/7.pdf",
    mimeType: "application/pdf",
  });
  assert.deepEqual(parseFileReference("file:note/7.secret.txt.enc"), {
    relativePath: "note/7.secret.txt.enc",
    mimeType: null,
  });
  assert.equal(parseFileReference("data:image/png;base64,abc"), null);
});

test("isSafeAttachmentPath rejects traversal, absolute, and backslash paths", () => {
  assert.equal(isSafeAttachmentPath("quote/7.pdf"), true);
  assert.equal(isSafeAttachmentPath("../quote/7.pdf"), false);
  assert.equal(isSafeAttachmentPath("quote/../7.pdf"), false);
  assert.equal(isSafeAttachmentPath("/quote/7.pdf"), false);
  assert.equal(isSafeAttachmentPath("quote\\7.pdf"), false);
});

test("replaceTopLevelFolder preserves the rest of the path", () => {
  assert.equal(
    replaceTopLevelFolder("quote/subdir/7.pdf", "historical"),
    "historical/subdir/7.pdf"
  );
});

test("getRehomeColumnSql rejects unsupported columns", () => {
  assert.equal(getRehomeColumnSql("attachment_full"), "attachment_full");
  assert.equal(getRehomeColumnSql("thumbnail"), "thumbnail");
  assert.throws(() => getRehomeColumnSql("note_text"), /Unsupported attachment column/);
});

test("buildAttachmentRehomePlan reports drift from legacy and changed note-type folders", () => {
  const attachmentsDir = "/vault/attachments";
  const existing = new Set([
    path.join(attachmentsDir, "quotes", "1.pdf"),
    path.join(attachmentsDir, "quote", "2.pdf"),
    path.join(attachmentsDir, "quote", "collision.pdf"),
    path.join(attachmentsDir, "historical", "collision.pdf"),
  ]);

  const plan = buildAttachmentRehomePlan(
    [
      {
        attachment_id: 1,
        note_id: 10,
        position: 0,
        note_type: "quote",
        attachment_full: "file:quotes/1.pdf:application/pdf",
        thumbnail: null,
      },
      {
        attachment_id: 2,
        note_id: 11,
        position: 0,
        note_type: "historical",
        attachment_full: "file:quote/2.pdf:application/pdf",
        thumbnail: null,
      },
      {
        attachment_id: 3,
        note_id: 12,
        position: 0,
        note_type: "historical",
        attachment_full: "file:quote/missing.pdf:application/pdf",
        thumbnail: null,
      },
      {
        attachment_id: 4,
        note_id: 13,
        position: 0,
        note_type: "historical",
        attachment_full: "file:quote/collision.pdf:application/pdf",
        thumbnail: null,
      },
      {
        attachment_id: 5,
        note_id: 14,
        position: 0,
        note_type: "quote",
        attachment_full: "file:quote/current.pdf:application/pdf",
        thumbnail: "file:../bad.jpg:image/jpeg",
      },
    ],
    {
      attachmentsDir,
      existsSync: (filePath) => existing.has(filePath),
    }
  );

  assert.equal(plan.totalFileRefs, 6);
  assert.equal(plan.driftCount, 4);
  assert.equal(plan.movableCount, 2);
  assert.equal(plan.missingSourceCount, 1);
  assert.equal(plan.collisionCount, 1);
  assert.equal(plan.invalidReferenceCount, 1);
  assert.deepEqual(
    plan.items.map((item) => ({
      id: item.attachmentId,
      column: item.column,
      status: item.status,
      targetPath: item.targetPath,
      targetRef: item.targetRef,
    })),
    [
      {
        id: 1,
        column: "attachment_full",
        status: "movable",
        targetPath: "quote/1.pdf",
        targetRef: "file:quote/1.pdf:application/pdf",
      },
      {
        id: 2,
        column: "attachment_full",
        status: "movable",
        targetPath: "historical/2.pdf",
        targetRef: "file:historical/2.pdf:application/pdf",
      },
      {
        id: 3,
        column: "attachment_full",
        status: "missing_source",
        targetPath: "historical/missing.pdf",
        targetRef: "file:historical/missing.pdf:application/pdf",
      },
      {
        id: 4,
        column: "attachment_full",
        status: "target_exists",
        targetPath: "historical/collision.pdf",
        targetRef: "file:historical/collision.pdf:application/pdf",
      },
      {
        id: 5,
        column: "thumbnail",
        status: "invalid_reference",
        targetPath: undefined,
        targetRef: undefined,
      },
    ]
  );
});

function makeFs(existingFiles) {
  const files = new Set(existingFiles);
  const calls = [];
  return {
    files,
    calls,
    existsSync(filePath) {
      return files.has(filePath);
    },
    mkdirSync(dirPath, options) {
      calls.push(["mkdirSync", dirPath, options]);
    },
    renameSync(from, to) {
      calls.push(["renameSync", from, to]);
      if (!files.has(from)) throw new Error(`missing ${from}`);
      if (files.has(to)) throw new Error(`target exists ${to}`);
      files.delete(from);
      files.add(to);
    },
  };
}

test("applyAttachmentRehomePlan moves files and updates note_attachments plus primary flat fields", async () => {
  const attachmentsDir = "/vault/attachments";
  const source = path.join(attachmentsDir, "quote", "7.pdf");
  const target = path.join(attachmentsDir, "historical", "7.pdf");
  const fsImpl = makeFs([source]);
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
  const plan = {
    items: [
      {
        attachmentId: 1,
        noteId: 7,
        position: 0,
        column: "attachment_full",
        currentPath: "quote/7.pdf",
        targetPath: "historical/7.pdf",
        targetRef: "file:historical/7.pdf:application/pdf",
        status: "movable",
      },
    ],
  };

  const result = await applyAttachmentRehomePlan(plan, {
    client,
    attachmentsDir,
    fsImpl,
  });

  assert.equal(fsImpl.files.has(source), false);
  assert.equal(fsImpl.files.has(target), true);
  assert.deepEqual(result, {
    movedCount: 1,
    skippedCount: 0,
    failedCount: 0,
    results: [
      {
        attachmentId: 1,
        noteId: 7,
        column: "attachment_full",
        status: "moved",
        from: "quote/7.pdf",
        to: "historical/7.pdf",
        targetRef: "file:historical/7.pdf:application/pdf",
      },
    ],
  });
  assert.deepEqual(calls.map((call) => call.sql), [
    "SAVEPOINT rehome_attachment",
    "UPDATE note_attachments SET attachment_full = $1 WHERE id = $2",
    "UPDATE notes SET attachment_full = $1 WHERE id = $2",
    "RELEASE SAVEPOINT rehome_attachment",
  ]);
});

test("applyAttachmentRehomePlan skips non-movable and rechecked blocked items", async () => {
  const attachmentsDir = "/vault/attachments";
  const source = path.join(attachmentsDir, "quote", "7.pdf");
  const target = path.join(attachmentsDir, "historical", "7.pdf");
  const fsImpl = makeFs([source, target]);
  const client = {
    async query() {
      throw new Error("query should not be called");
    },
  };
  const plan = {
    items: [
      {
        attachmentId: 1,
        noteId: 7,
        position: 0,
        column: "attachment_full",
        status: "target_exists",
      },
      {
        attachmentId: 2,
        noteId: 8,
        position: 0,
        column: "attachment_full",
        currentPath: "quote/7.pdf",
        targetPath: "historical/7.pdf",
        targetRef: "file:historical/7.pdf:application/pdf",
        status: "movable",
      },
    ],
  };

  const result = await applyAttachmentRehomePlan(plan, {
    client,
    attachmentsDir,
    fsImpl,
  });

  assert.deepEqual(result.results, [
    {
      attachmentId: 1,
      noteId: 7,
      column: "attachment_full",
      status: "skipped",
      reason: "target_exists",
    },
    {
      attachmentId: 2,
      noteId: 8,
      column: "attachment_full",
      status: "skipped",
      reason: "target_exists",
    },
  ]);
  assert.equal(result.movedCount, 0);
  assert.equal(result.skippedCount, 2);
});

test("applyAttachmentRehomePlan restores moved files when DB update fails", async () => {
  const attachmentsDir = "/vault/attachments";
  const source = path.join(attachmentsDir, "quote", "7.pdf");
  const target = path.join(attachmentsDir, "historical", "7.pdf");
  const fsImpl = makeFs([source]);
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith("UPDATE note_attachments")) {
        throw new Error("db failed");
      }
      return { rows: [] };
    },
  };
  const plan = {
    items: [
      {
        attachmentId: 1,
        noteId: 7,
        position: 0,
        column: "attachment_full",
        currentPath: "quote/7.pdf",
        targetPath: "historical/7.pdf",
        targetRef: "file:historical/7.pdf:application/pdf",
        status: "movable",
      },
    ],
  };

  const result = await applyAttachmentRehomePlan(plan, {
    client,
    attachmentsDir,
    fsImpl,
  });

  assert.equal(fsImpl.files.has(source), true);
  assert.equal(fsImpl.files.has(target), false);
  assert.deepEqual(result.results, [
    {
      attachmentId: 1,
      noteId: 7,
      column: "attachment_full",
      status: "failed",
      reason: "db_update_failed",
      error: "db failed",
    },
  ]);
  assert.deepEqual(calls.map((call) => call.sql), [
    "SAVEPOINT rehome_attachment",
    "UPDATE note_attachments SET attachment_full = $1 WHERE id = $2",
    "ROLLBACK TO SAVEPOINT rehome_attachment",
    "RELEASE SAVEPOINT rehome_attachment",
  ]);
  assert.deepEqual(
    fsImpl.calls.filter((call) => call[0] === "renameSync").map((call) => [call[1], call[2]]),
    [
      [source, target],
      [target, source],
    ]
  );
});
