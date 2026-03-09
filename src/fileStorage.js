/**
 * File Storage Helper
 * Handles hybrid storage: small files in DB, large files in filesystem
 */

const fs = require("fs");
const path = require("path");

// Default threshold (can be overridden per request)
const DEFAULT_MAX_SIZE_MB = 1;
const ATTACHMENTS_DIR = path.join(__dirname, "../attachments");

// Ensure attachments directories exist
function ensureDirectories() {
  const dirs = [
    ATTACHMENTS_DIR,
    path.join(ATTACHMENTS_DIR, "quotes"),
    path.join(ATTACHMENTS_DIR, "authors"),
    path.join(ATTACHMENTS_DIR, "sources"),
    path.join(ATTACHMENTS_DIR, "training"),
    path.join(ATTACHMENTS_DIR, "notes"),
    path.join(ATTACHMENTS_DIR, "puzzles"),
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
 * @param {string} type - 'quotes', 'authors', or 'sources'
 * @param {number} id - ID of the entity
 * @param {string} suffix - Optional suffix (e.g., '_full' for full-size images)
 * @returns {string} Relative path to the saved file
 */
function saveToFilesystem(base64String, type, id, suffix = "") {
  ensureDirectories();

  // Extract mime type and data
  const matches = base64String.match(/^data:(.+?);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid base64 string format");
  }

  const mimeType = matches[1];
  const base64Data = matches[2];

  // Determine file extension from mime type
  const extensions = {
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

  const ext = extensions[mimeType] || "bin";
  const filename = `${id}${suffix}.${ext}`;
  const relativePath = path.join(type, filename);
  const fullPath = path.join(ATTACHMENTS_DIR, relativePath);

  // Convert base64 to buffer and save
  const buffer = Buffer.from(base64Data, "base64");
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
  const fullPath = path.join(ATTACHMENTS_DIR, relativePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${relativePath}`);
    return null;
  }

  const buffer = fs.readFileSync(fullPath);
  
  // Determine mime type from extension
  const ext = path.extname(fullPath).toLowerCase().slice(1);
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };

  const mimeType = mimeTypes[ext] || "application/octet-stream";
  const base64Data = buffer.toString("base64");

  return `data:${mimeType};base64,${base64Data}`;
}

/**
 * Delete file from filesystem
 * @param {string} relativePath - Relative path (e.g., 'quotes/123_full.jpg')
 */
function deleteFromFilesystem(relativePath) {
  if (!relativePath) return;

  const fullPath = path.join(ATTACHMENTS_DIR, relativePath);

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
  const matches = base64String.match(/^data:(.+?);base64,/);
  return matches ? matches[1] : 'application/octet-stream';
}

/**
 * Process attachment for storage - decides DB vs filesystem
 * Returns EITHER base64 string OR file reference string
 * @param {string} base64String - Base64 encoded file
 * @param {string} type - 'quotes', 'authors', or 'sources'
 * @param {number} id - ID of the entity
 * @param {string} suffix - Optional suffix (e.g., '_full')
 * @param {number} maxSizeMB - Maximum size in MB for DB storage (optional, default 1)
 * @returns {string|null} Base64 string OR "file:path:mimetype" string
 */
function processForStorage(base64String, type, id, suffix = "", maxSizeMB = DEFAULT_MAX_SIZE_MB) {
  if (!base64String) {
    return null;
  }

  // If it's already a file reference, return as-is
  if (isFilePath(base64String)) {
    return base64String;
  }

  if (shouldStoreExternally(base64String, maxSizeMB)) {
    // Store in filesystem and return file reference
    const mimeType = getMimeTypeFromBase64(base64String);
    const path = saveToFilesystem(base64String, type, id, suffix);
    return createFileReference(path, mimeType);
  } else {
    // Store in database as base64
    return base64String;
  }
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

module.exports = {
  DEFAULT_MAX_SIZE_MB,
  ATTACHMENTS_DIR,
  ensureDirectories,
  getBase64Size,
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
};
