const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildDirectUploadResponse,
  getPcmWavPath,
  getTempUploadFilename,
  handleDirectUpload,
  inferUploadMimeType,
  isWavMimeType,
  getUploadFolder,
  registerUploadRoutes,
  transcodeWavToPcm,
} = require("../src/routes/uploads");

const silentLogger = {
  error() {},
  warn() {},
};

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-upload-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeFileStorage(attachmentsDir) {
  return {
    MIME_TO_EXT: {
      "application/pdf": "pdf",
      "audio/wav": "wav",
    },
    getAttachmentsDir: () => attachmentsDir,
    getMimeFromExtension(ext) {
      return ext === "pdf" ? "application/pdf" : "application/octet-stream";
    },
    createFileReference(relativePath, mimeType) {
      return `file:${relativePath}:${mimeType}`;
    },
  };
}

test("getTempUploadFilename preserves original extension or falls back to MIME", () => {
  assert.equal(
    getTempUploadFilename(
      { originalname: "report.pdf", mimetype: "application/pdf" },
      { now: () => 123, mimeToExt: { "application/pdf": "pdf" } }
    ),
    "tmp_123.pdf"
  );
  assert.equal(
    getTempUploadFilename(
      { originalname: "blob", mimetype: "application/pdf" },
      { now: () => 123, mimeToExt: { "application/pdf": "pdf" } }
    ),
    "tmp_123.pdf"
  );
  assert.equal(
    getTempUploadFilename(
      { originalname: "blob", mimetype: "" },
      { now: () => 123, mimeToExt: {} }
    ),
    "tmp_123.bin"
  );
});

test("inferUploadMimeType uses request MIME first, then filename extension", () => {
  const fileStorage = makeFileStorage("/tmp");

  assert.equal(
    inferUploadMimeType({ mimetype: "text/plain", filename: "tmp_1.pdf" }, fileStorage),
    "text/plain"
  );
  assert.equal(
    inferUploadMimeType({ mimetype: "", filename: "tmp_1.pdf" }, fileStorage),
    "application/pdf"
  );
});

test("isWavMimeType recognizes WAV variants", () => {
  assert.equal(isWavMimeType("audio/wav"), true);
  assert.equal(isWavMimeType("audio/x-wav"), true);
  assert.equal(isWavMimeType("audio/wave"), true);
  assert.equal(isWavMimeType("audio/mpeg"), false);
});

test("getUploadFolder normalizes legacy plural folder hints", () => {
  assert.equal(getUploadFolder({ query: { folder: "quotes" } }), "quote");
  assert.equal(getUploadFolder({ query: { folder: "notes" } }), "note");
  assert.equal(getUploadFolder({ query: { folder: "puzzles" } }), "puzzle");
  assert.equal(getUploadFolder({ query: { folder: "historical" } }), "historical");
  assert.throws(
    () => getUploadFolder({ query: { folder: "../quote" } }),
    /Invalid attachment folder/
  );
});

test("transcodeWavToPcm renames generated PCM output over the original WAV", async (t) => {
  const dir = makeTempDir(t);
  const wavPath = path.join(dir, "input.wav");
  fs.writeFileSync(wavPath, "original");

  const result = await transcodeWavToPcm(wavPath, {
    logger: silentLogger,
    execFile(command, args, callback) {
      assert.equal(command, "ffmpeg");
      fs.writeFileSync(args[args.length - 1], "pcm");
      callback(null);
    },
  });

  assert.deepEqual(result, { ok: true, mimeType: "audio/wav" });
  assert.equal(fs.readFileSync(wavPath, "utf8"), "pcm");
  assert.equal(fs.existsSync(getPcmWavPath(wavPath)), false);
});

test("transcodeWavToPcm cleans generated PCM output on failure", async (t) => {
  const dir = makeTempDir(t);
  const wavPath = path.join(dir, "input.wav");
  const pcmPath = getPcmWavPath(wavPath);
  fs.writeFileSync(wavPath, "original");
  fs.writeFileSync(pcmPath, "partial");

  const result = await transcodeWavToPcm(wavPath, {
    logger: silentLogger,
    execFile(command, args, callback) {
      callback(new Error("ffmpeg failed"));
    },
  });

  assert.deepEqual(result, { ok: false });
  assert.equal(fs.readFileSync(wavPath, "utf8"), "original");
  assert.equal(fs.existsSync(pcmPath), false);
});

test("buildDirectUploadResponse returns file reference, original filename, and size", async (t) => {
  const attachmentsDir = makeTempDir(t);
  fs.mkdirSync(path.join(attachmentsDir, "note"));
  fs.writeFileSync(path.join(attachmentsDir, "note", "tmp_1.pdf"), "hello");
  const fileStorage = makeFileStorage(attachmentsDir);

  const response = await buildDirectUploadResponse(
    {
      query: { folder: "note" },
      file: {
        filename: "tmp_1.pdf",
        originalname: "Report.pdf",
        mimetype: "",
      },
    },
    { fileStorage, logger: silentLogger }
  );

  assert.deepEqual(response, {
    fileRef: "file:note/tmp_1.pdf:application/pdf",
    filename: "Report.pdf",
    sizeMB: "0.00",
  });
});

test("buildDirectUploadResponse uses canonical folder names for legacy hints", async (t) => {
  const attachmentsDir = makeTempDir(t);
  fs.mkdirSync(path.join(attachmentsDir, "quote"));
  fs.writeFileSync(path.join(attachmentsDir, "quote", "tmp_1.pdf"), "hello");
  const fileStorage = makeFileStorage(attachmentsDir);

  const response = await buildDirectUploadResponse(
    {
      query: { folder: "quotes" },
      file: {
        filename: "tmp_1.pdf",
        originalname: "Report.pdf",
        mimetype: "",
      },
    },
    { fileStorage, logger: silentLogger }
  );

  assert.deepEqual(response, {
    fileRef: "file:quote/tmp_1.pdf:application/pdf",
    filename: "Report.pdf",
    sizeMB: "0.00",
  });
});

test("buildDirectUploadResponse normalizes successful WAV transcodes to audio/wav", async (t) => {
  const attachmentsDir = makeTempDir(t);
  fs.mkdirSync(path.join(attachmentsDir, "note"));
  fs.writeFileSync(path.join(attachmentsDir, "note", "tmp_1.wav"), "original");
  const fileStorage = makeFileStorage(attachmentsDir);

  const response = await buildDirectUploadResponse(
    {
      query: { folder: "note" },
      file: {
        filename: "tmp_1.wav",
        originalname: "Recording.wav",
        mimetype: "audio/x-wav",
      },
    },
    {
      fileStorage,
      logger: silentLogger,
      execFile(command, args, callback) {
        fs.writeFileSync(args[args.length - 1], "pcm");
        callback(null);
      },
    }
  );

  assert.deepEqual(response, {
    fileRef: "file:note/tmp_1.wav:audio/wav",
    filename: "Recording.wav",
    sizeMB: "0.00",
  });
  assert.equal(fs.readFileSync(path.join(attachmentsDir, "note", "tmp_1.wav"), "utf8"), "pcm");
});

test("handleDirectUpload returns 400 when no file is present", async () => {
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

  await handleDirectUpload({ query: {} }, res, {
    fileStorage: makeFileStorage("/tmp"),
    logger: silentLogger,
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "No file uploaded" });
});

test("registerUploadRoutes attaches the direct upload route with middleware", () => {
  const calls = [];
  const upload = {
    single(fieldName) {
      calls.push(["single", fieldName]);
      return function uploadMiddleware() {};
    },
  };
  const app = {
    post(routePath, ...handlers) {
      calls.push(["post", routePath, handlers.length]);
    },
  };

  registerUploadRoutes(app, {
    upload,
    fileStorage: makeFileStorage("/tmp"),
    logger: silentLogger,
  });

  assert.deepEqual(calls, [
    ["single", "file"],
    ["post", "/api/upload-attachment", 2],
  ]);
});
