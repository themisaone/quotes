const fs = require("fs");
const path = require("path");
const { execFile: defaultExecFile } = require("child_process");
const multer = require("multer");
const { normalizeAttachmentFolder } = require("../attachmentFolders");

const WAV_MIME_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave"]);

function getUploadFolder(req) {
  return normalizeAttachmentFolder(req.query?.folder, "note");
}

function getTempUploadFilename(file, { now = Date.now, mimeToExt = {} } = {}) {
  const ext = path.extname(file.originalname) || `.${mimeToExt[file.mimetype] || "bin"}`;
  return `tmp_${now()}${ext}`;
}

function inferUploadMimeType(file, fileStorage) {
  return file.mimetype || fileStorage.getMimeFromExtension(path.extname(file.filename).slice(1));
}

function isWavMimeType(mimeType) {
  return WAV_MIME_TYPES.has(mimeType);
}

function getPcmWavPath(fullPath) {
  return fullPath.replace(/\.wav$/i, "_pcm.wav");
}

async function transcodeWavToPcm(fullPath, {
  fsImpl = fs,
  execFile = defaultExecFile,
  logger = console,
} = {}) {
  const pcmPath = getPcmWavPath(fullPath);

  try {
    await new Promise((resolve, reject) => {
      execFile(
        "ffmpeg",
        ["-y", "-i", fullPath, "-acodec", "pcm_s16le", pcmPath],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    fsImpl.renameSync(pcmPath, fullPath);
    return { ok: true, mimeType: "audio/wav" };
  } catch (transcodeErr) {
    logger.warn(`⚠️  WAV transcode failed (file kept as-is): ${transcodeErr.message}`);
    if (fsImpl.existsSync(pcmPath)) fsImpl.unlinkSync(pcmPath);
    return { ok: false };
  }
}

function createUploadMiddleware({ fileStorage }) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // req.body fields are not parsed yet when the file field precedes them.
      try {
        const folder = getUploadFolder(req);
        const dir = path.join(fileStorage.getAttachmentsDir(), folder);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      cb(null, getTempUploadFilename(file, { mimeToExt: fileStorage.MIME_TO_EXT }));
    },
  });
  return multer({ storage });
}

async function buildDirectUploadResponse(req, {
  fileStorage,
  fsImpl = fs,
  pathImpl = path,
  execFile = defaultExecFile,
  logger = console,
}) {
  if (!req.file) {
    const error = new Error("No file uploaded");
    error.status = 400;
    throw error;
  }

  const folder = getUploadFolder(req);
  const relPath = `${folder}/${req.file.filename}`;
  let mimeType = inferUploadMimeType(req.file, fileStorage);

  if (isWavMimeType(mimeType)) {
    const fullPath = pathImpl.join(fileStorage.getAttachmentsDir(), relPath);
    const result = await transcodeWavToPcm(fullPath, { fsImpl, execFile, logger });
    if (result.ok) mimeType = result.mimeType;
  }

  const fullPath = pathImpl.join(fileStorage.getAttachmentsDir(), relPath);
  const sizeMB = (fsImpl.statSync(fullPath).size / 1024 / 1024).toFixed(2);
  const fileRef = fileStorage.createFileReference(relPath, mimeType);
  return {
    fileRef,
    filename: req.file.originalname,
    sizeMB,
  };
}

async function handleDirectUpload(req, res, deps) {
  try {
    const response = await buildDirectUploadResponse(req, deps);
    res.json(response);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    deps.logger?.error?.("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
}

function registerUploadRoutes(app, {
  upload,
  fileStorage,
  fsImpl = fs,
  pathImpl = path,
  execFile = defaultExecFile,
  logger = console,
}) {
  if (!app) throw new Error("Express app is required");
  if (!upload) throw new Error("upload middleware is required");
  if (!fileStorage) throw new Error("fileStorage is required");

  app.post("/api/upload-attachment", upload.single("file"), (req, res) => {
    handleDirectUpload(req, res, { fileStorage, fsImpl, pathImpl, execFile, logger });
  });
}

module.exports = {
  buildDirectUploadResponse,
  createUploadMiddleware,
  getUploadFolder,
  getPcmWavPath,
  getTempUploadFilename,
  handleDirectUpload,
  inferUploadMimeType,
  isWavMimeType,
  registerUploadRoutes,
  transcodeWavToPcm,
};
