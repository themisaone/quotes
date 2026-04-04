/**
 * File Storage Helper
 * Handles hybrid storage: small files in DB, large files in filesystem
 */

const fs = require("fs");
const path = require("path");

// Default threshold (can be overridden per request)
const DEFAULT_MAX_SIZE_MB = 1;
const DEFAULT_ATTACHMENTS_DIR = path.join(__dirname, "../attachments");

// Mutable vault dir — updated at runtime when settings change
let _attachmentsDir = DEFAULT_ATTACHMENTS_DIR;

function getAttachmentsDir() { return _attachmentsDir; }

/**
 * Set the vault root (user-supplied path like /home/user/Dropbox/MisaVault).
 * The actual attachments directory is always <vaultRoot>/attachments.
 * Pass empty/null to reset to the default (./attachments inside the app).
 */
function setAttachmentsDir(vaultRoot) {
  if (vaultRoot && vaultRoot.trim()) {
    _attachmentsDir = path.join(vaultRoot.trim(), 'attachments');
  } else {
    _attachmentsDir = DEFAULT_ATTACHMENTS_DIR;
  }
  console.log(`📁 Vault attachments dir: ${_attachmentsDir}`);
}

// MIME type mappings (centralized to avoid duplication)
const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const EXT_TO_MIME = {
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "png": "image/png",
  "gif": "image/gif",
  "webp": "image/webp",
  "pdf": "application/pdf",
  "mp4": "video/mp4",
  "mov": "video/quicktime",
  "webm": "video/webm",
};

// Ensure attachments directories exist
function ensureDirectories() {
  const base = getAttachmentsDir();
  const dirs = [
    base,
    path.join(base, "quote"),       // note_type = 'quote'
    path.join(base, "note"),        // note_type = 'note'
    path.join(base, "training"),    // note_type = 'training'
    path.join(base, "puzzle"),      // note_type = 'puzzle'
    path.join(base, "historical"),  // note_type = 'historical'
    path.join(base, "authors"),     // author images
    path.join(base, "sources"),     // source images
  ];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
}

/**
 * Get size of base64 string in bytes
 */
function getBase64Size(base64String) {
  if (!base64String) return 0;
  
  // Remove data URL prefix if present
  const base64Data = base64String.replace(/^data:.*?;base64,/, "");
  
  // Calculate actual byte size
  // Base64 encoding increases size by ~33%, so we decode to get actual size
  const padding = (base64Data.match(/=/g) || []).length;
  return (base64Data.length * 3) / 4 - padding;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMime(mimeType) {
  return MIME_TO_EXT[mimeType] || "bin";
}

/**
 * Get MIME type from file extension
 */
function getMimeFromExtension(ext) {
  const normalized = ext.toLowerCase().replace(/^\./, ''); // Remove leading dot if present
  return EXT_TO_MIME[normalized] || "application/octet-stream";
}

/**
 * Parse base64 data URL into components
 * @param {string} base64String - Full data URL with base64 data
 * @returns {Object} { mimeType, data }
 */
function parseBase64Data(base64String) {
  const matches = base64String.match(/^data:(.+?);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid base64 string format");
  }
  return {
    mimeType: matches[1],
    data: matches[2]
  };
}

/**
 * Check if file should be stored externally
 * @param {string} base64String - Base64 encoded data
 * @param {number} maxSizeMB - Maximum size in MB for DB storage (optional, default 1)
 */
function shouldStoreExternally(base64String, maxSizeMB = DEFAULT_MAX_SIZE_MB) {
  const size = getBase64Size(base64String);
  const maxSize = maxSizeMB * 1024 * 1024; // Convert MB to bytes
  return size >= maxSize;
}

/**
 * Save file to filesystem
 * @param {string} base64String - Base64 encoded file data
 * @param {string} type - 'quotes', 'authors', 'sources', 'training', 'notes', 'puzzles'
 * @param {number} id - ID of the entity
 * @param {string} suffix - Optional suffix (e.g., '_full' for full-size images)
 * @returns {string} Relative path to the saved file
 */
function saveToFilesystem(base64String, type, id, suffix = "") {
  ensureDirectories();

  // Parse base64 data
  const { mimeType, data } = parseBase64Data(base64String);
  
  // Generate filename
  const ext = getExtensionFromMime(mimeType);
  const filename = `${id}${suffix}.${ext}`;
  const relativePath = path.join(type, filename);
  const fullPath = path.join(getAttachmentsDir(), relativePath);

  // Ensure the target directory exists (handles any note_type folder dynamically)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  // Convert base64 to buffer and save
  const buffer = Buffer.from(data, "base64");
  fs.writeFileSync(fullPath, buffer);

  console.log(`Saved external file: ${relativePath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  return relativePath;
}

/**
 * Read file from filesystem
 * @param {string} relativePath - Relative path (e.g., 'quotes/123_full.jpg')
 * @returns {string} Base64 encoded string with data URL prefix
 */
function readFromFilesystem(relativePath) {
  const fullPath = path.join(getAttachmentsDir(), relativePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${relativePath}`);
    return null;
  }

  const buffer = fs.readFileSync(fullPath);
  
  // Determine mime type from extension
  const ext = path.extname(fullPath).toLowerCase().slice(1);
  const mimeType = getMimeFromExtension(ext);
  const base64Data = buffer.toString("base64");

  return `data:${mimeType};base64,${base64Data}`;
}

/**
 * Delete file from filesystem
 * @param {string} relativePath - Relative path (e.g., 'quotes/123_full.jpg')
 */
function deleteFromFilesystem(relativePath) {
  if (!relativePath) return;

  const fullPath = path.join(getAttachmentsDir(), relativePath);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    console.log(`Deleted external file: ${relativePath}`);
  }
}

/**
 * Check if value is a file path reference
 */
function isFilePath(value) {
  return value && typeof value === 'string' && value.startsWith('file:');
}

/**
 * Parse file path reference
 * @param {string} value - Format: "file:quotes/123.jpg:image/jpeg"
 * @returns {object} { path, mimeType }
 */
function parseFilePath(value) {
  if (!isFilePath(value)) return null;
  
  const parts = value.split(':');
  return {
    path: parts[1],
    mimeType: parts[2] || 'application/octet-stream'
  };
}

/**
 * Create file path reference
 * @param {string} relativePath - e.g., "quotes/123.jpg"
 * @param {string} mimeType - e.g., "image/jpeg"
 * @returns {string} Format: "file:quotes/123.jpg:image/jpeg"
 */
function createFileReference(relativePath, mimeType) {
  return `file:${relativePath}:${mimeType}`;
}

/**
 * Extract mime type from base64 string
 */
function getMimeTypeFromBase64(base64String) {
  try {
    const { mimeType } = parseBase64Data(base64String);
    return mimeType;
  } catch (error) {
    return 'application/octet-stream';
  }
}

/**
 * Process attachment for storage.
 * For thumbnails (forceExternal=false): keeps small values in DB, large ones on disk (legacy threshold).
 * For full attachments (forceExternal=true): always writes to disk regardless of size.
 * @param {string} base64String - Base64 data URL OR existing "file:..." reference
 * @param {string} type - storage sub-folder (e.g. 'historical', 'notes')
 * @param {number|string} id - note ID (used for filename)
 * @param {string} suffix - filename suffix, e.g. '' for full attachments (no longer '_full')
 * @param {number} maxSizeMB - threshold for DB storage (only used when forceExternal=false)
 * @param {boolean} forceExternal - if true, always save to filesystem (use for attachment_full)
 * @returns {string|null} Base64 string (for DB) OR "file:path:mimetype" string (for disk)
 */
function processForStorage(base64String, type, id, suffix = "", maxSizeMB = DEFAULT_MAX_SIZE_MB, forceExternal = false) {
  if (!base64String) return null;

  // Already a file reference — return as-is (rename already handled by finalizeUploadedFile)
  if (isFilePath(base64String)) return base64String;

  if (forceExternal || shouldStoreExternally(base64String, maxSizeMB)) {
    const mimeType = getMimeTypeFromBase64(base64String);
    const filePath = saveToFilesystem(base64String, type, id, suffix);
    return createFileReference(filePath, mimeType);
  }

  // Keep in database as base64
  return base64String;
}

/**
 * Retrieve attachment from storage - handles both DB and filesystem
 * @param {string} value - EITHER base64 string OR "file:path:mimetype"
 * @param {boolean} returnMetadata - If true, return {data, mimeType, isFile}
 * @returns {string|object|null} Base64 string, metadata object, or null
 */
function retrieveFromStorage(value, returnMetadata = false) {
  if (!value) return null;

  if (isFilePath(value)) {
    // It's in the filesystem
    const { path, mimeType } = parseFilePath(value);
    const base64Data = readFromFilesystem(path);
    
    if (returnMetadata) {
      return { data: base64Data, mimeType, isFile: true, path };
    }
    return base64Data;
  } else {
    // It's in the database as base64
    if (returnMetadata) {
      const mimeType = getMimeTypeFromBase64(value);
      return { data: value, mimeType, isFile: false, path: null };
    }
    return value;
  }
}

/**
 * Delete attachment - handles both DB and filesystem
 * @param {string} value - EITHER base64 string OR "file:path:mimetype"
 */
function deleteAttachment(value) {
  if (isFilePath(value)) {
    const { path } = parseFilePath(value);
    deleteFromFilesystem(path);
  }
  // If it's base64, nothing to delete from filesystem
}

/**
 * Copy an attachment file to a new note ID, returning the new file reference.
 * For base64 values, returns as-is (no file to copy).
 * For file: references, copies the physical file replacing oldId with newId in the filename.
 * @param {string} value - EITHER base64 string OR "file:path:mimetype"
 * @param {number|string} oldId - The original note ID (or compound key like "123_a0")
 * @param {number|string} newId - The new note ID (or compound key like "456_a0")
 * @returns {string|null} New file reference, original base64, or null
 */
function copyAttachmentFile(value, oldId, newId) {
  if (!value || !isFilePath(value)) return value;

  const { path: relativePath, mimeType } = parseFilePath(value);
  const oldFullPath = path.join(getAttachmentsDir(), relativePath);

  if (!fs.existsSync(oldFullPath)) {
    console.warn(`copyAttachmentFile: source file not found: ${relativePath}`);
    return value;
  }

  const dir = path.dirname(relativePath);
  const basename = path.basename(relativePath);
  // Replace only the first occurrence of oldId in the basename (ID is always the prefix)
  const newBasename = basename.replace(String(oldId), String(newId));
  const newRelativePath = path.join(dir, newBasename);
  const newFullPath = path.join(getAttachmentsDir(), newRelativePath);

  fs.copyFileSync(oldFullPath, newFullPath);
  console.log(`Copied attachment: ${relativePath} → ${newRelativePath}`);

  return createFileReference(newRelativePath, mimeType);
}

/**
 * If `value` is a file: reference with a tmp_ filename, rename it to use noteId.
 * Returns the updated file: reference (or original value unchanged if not applicable).
 * @param {string} value - "file:notes/tmp_123.pdf:application/pdf"
 * @param {number|string} noteId - The real note ID
 * @param {string} suffix - e.g. '' or '_full'
 * @returns {string} Updated reference
 */
function finalizeUploadedFile(value, noteId, suffix = '') {
  if (!isFilePath(value)) return value;
  const { path: relPath, mimeType } = parseFilePath(value);
  const basename = path.basename(relPath);
  if (!basename.startsWith('tmp_')) return value; // already named correctly

  const dir = path.dirname(relPath);
  const ext = path.extname(basename);
  const newBasename = `${noteId}${suffix}${ext}`;
  const newRelPath = path.join(dir, newBasename).replace(/\\/g, '/');

  const oldFull = path.join(getAttachmentsDir(), relPath);
  const newFull = path.join(getAttachmentsDir(), newRelPath);

  if (fs.existsSync(oldFull)) {
    // If target already exists (unlikely), delete it first
    if (fs.existsSync(newFull)) fs.unlinkSync(newFull);
    fs.renameSync(oldFull, newFull);
    console.log(`Renamed upload: ${relPath} → ${newRelPath}`);
  }
  return createFileReference(newRelPath, mimeType);
}

module.exports = {
  DEFAULT_MAX_SIZE_MB,
  DEFAULT_ATTACHMENTS_DIR,
  get ATTACHMENTS_DIR() { return _attachmentsDir; }, // backwards-compatible getter
  getAttachmentsDir,
  setAttachmentsDir,
  MIME_TO_EXT,
  EXT_TO_MIME,
  ensureDirectories,
  getBase64Size,
  getExtensionFromMime,
  getMimeFromExtension,
  parseBase64Data,
  shouldStoreExternally,
  saveToFilesystem,
  readFromFilesystem,
  deleteFromFilesystem,
  isFilePath,
  parseFilePath,
  createFileReference,
  getMimeTypeFromBase64,
  processForStorage,
  retrieveFromStorage,
  deleteAttachment,
  copyAttachmentFile,
  finalizeUploadedFile,
};
