const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const pool = require("./db");
const {
  createAttachmentHelpers,
  registerAttachmentRoutes,
} = require("./routes/attachments");
const { registerAttachmentMigrationRoutes } = require("./routes/attachmentMigration");
const { registerAuthorRoutes } = require("./routes/authors");
const fileStorage = require("./fileStorage");
const instanceManager = require("./instanceManager");
const { registerDbAttachmentExportRoutes } = require("./routes/dbAttachmentExport");
const { registerDedupRoutes } = require("./routes/dedup");
const { registerExportImportRoutes } = require("./routes/exportImport");
const { registerInstanceRoutes } = require("./routes/instances");
const { registerMaintenanceRoutes } = require("./routes/maintenance");
const { registerModeRoutes } = require("./routes/mode");
const { registerPaletteRoutes } = require("./routes/palettes");
const { registerPdfExportRoutes } = require("./routes/pdfExport");
const { registerQuoteBulkRoutes } = require("./routes/quoteBulk");
const { registerQuoteRoutes } = require("./routes/quotes");
const { registerSettingsRoutes } = require("./routes/settings");
const { registerSourceRoutes } = require("./routes/sources");
const { registerTagRoutes } = require("./routes/tags");
const { createUploadMiddleware, registerUploadRoutes } = require("./routes/uploads");
const { registerVaultRoutes } = require("./routes/vault");
const {
  loadModesFromFile,
  resolveInitialMode,
  getAllowedTypes,
  normalizeModeName,
} = require("./modeConfig");
const {
  checkTagTablesExist,
  getTagsForNote,
  getTagsForNotes,
} = require("./tagHelpers");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

// ── Local config (vault path only — stays inside the app, never synced) ──
const LOCAL_FILE      = path.join(__dirname, '../config/local.json');
const DEFAULT_SETTINGS_FILE = path.join(__dirname, '../config/settings.json');
const DEFAULT_PALETTES_DIR  = path.join(__dirname, '../palettes');

function readLocalConfig() {
  try {
    if (fs.existsSync(LOCAL_FILE)) return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  } catch (_) {}
  return {};
}
function writeLocalConfig(obj) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(obj, null, 2));
}

// ── Active mode (set via MODE env var or PUT /api/mode, persisted in local.json) ──
const MODES_FILE = path.join(__dirname, '../config/modes.json');
const _modes = loadModesFromFile(MODES_FILE);

let _modeName = resolveInitialMode({
  envMode: process.env.MODE,
  localConfig: readLocalConfig(),
});
let _allowedTypes = getAllowedTypes(_modes, _modeName);

function applyMode(newMode) {
  const name = normalizeModeName(newMode);
  const types = _modes[name];
  if (!types) return false;
  _modeName    = name;
  _allowedTypes = types;
  return true;
}

console.log(`🎛️  Mode: ${_modeName} — types: [${_allowedTypes.join(', ')}]`);

// Derive vault-relative paths
function getSettingsFile() {
  const { vaultPath } = readLocalConfig();
  return vaultPath ? path.join(vaultPath, 'config', 'settings.json') : DEFAULT_SETTINGS_FILE;
}
function getPalettesDir() {
  const { vaultPath } = readLocalConfig();
  return vaultPath ? path.join(vaultPath, 'palettes') : DEFAULT_PALETTES_DIR;
}

// Ensure local config dir exists
fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Serve JS and CSS with no-cache so edits take effect on hard-refresh
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});

// Maintenance routes are registered before static so POST requests are never mistaken for file fetches.
registerMaintenanceRoutes(app, { pool, fileStorage, fsImpl: fs });

app.use(express.static(path.join(__dirname, "../public")));
// Serve attachment files from the configured vault (dynamic — honours vaultPath setting)
app.get('/attachments/*', (req, res) => {
  const relativePath = req.params[0];
  const filePath = path.join(fileStorage.getAttachmentsDir(), relativePath);
  if (!fs.existsSync(filePath)) return res.status(404).send('Attachment not found');
  res.sendFile(filePath);
});
// Serve PDF.js library for client-side PDF thumbnail generation
app.use('/pdfjs', express.static(path.join(__dirname, '../node_modules/pdfjs-dist/build')));

// Initialise vault path from local.json (called once at startup)
function initVaultPath() {
  try {
    const { vaultPath } = readLocalConfig();
    const root = vaultPath && String(vaultPath).trim();
    if (root) {
      if (!fs.existsSync(root)) {
        console.warn(
          `\n⚠️  Vault path from local.json does not exist here: ${root}\n` +
            '   Attachments and vault settings.json will not match your host until this path is visible ' +
            '(e.g. bind-mount the same host folder to this path in Docker).\n'
        );
      }
      fileStorage.setAttachmentsDir(root);
    }
  } catch (e) {
    console.warn('Could not read vault path from local.json:', e.message);
  }
}
initVaultPath();
fileStorage.ensureDirectories();

(function logResolvedSettingsPath() {
  try {
    const sf = getSettingsFile();
    const exists = fs.existsSync(sf);
    let nTypes = 0;
    if (exists) {
      const parsed = JSON.parse(fs.readFileSync(sf, 'utf8'));
      nTypes = Array.isArray(parsed.noteTypes) ? parsed.noteTypes.length : 0;
    }
    const { vaultPath } = readLocalConfig();
    const vr = vaultPath && String(vaultPath).trim();
    console.log(
      `📄 Settings: ${sf} (exists: ${exists}, noteTypes: ${nTypes})` +
        (vr ? ` | vault: ${vr} (exists: ${fs.existsSync(vr)})` : '')
    );
  } catch (e) {
    console.warn('Could not log settings path:', e.message);
  }
})();

// API to get storage configuration (returns default, actual value set by user in Settings)
app.get('/api/config/storage', (req, res) => {
  res.json({
    defaultMaxDbSizeMB: fileStorage.DEFAULT_MAX_SIZE_MB
  });
});

// GET/PUT /api/mode — current mode and runtime switching
registerModeRoutes(app, {
  getModeState: () => ({
    modeName: _modeName,
    allowedTypes: _allowedTypes,
    modes: _modes,
  }),
  applyMode,
  readLocalConfig,
  writeLocalConfig,
  modeLocked: !!process.env.MODE,
});

// ── Instance manager (multi-service on one host) ───────────────────────────
registerInstanceRoutes(app, { instanceManager, currentPort: PORT });

// Get/save settings
registerSettingsRoutes(app, {
  pool,
  fileStorage,
  getSettingsFile,
  readLocalConfig,
  writeLocalConfig,
  defaultSettingsFile: DEFAULT_SETTINGS_FILE,
  defaultPalettesDir: DEFAULT_PALETTES_DIR,
  modesFile: MODES_FILE,
  modesState: _modes,
  getActiveModeName: () => _modeName,
  setAllowedTypes: (types) => {
    _allowedTypes = types;
  },
});

// Helper function to retrieve thumbnails from hybrid storage
function retrieveQuoteImages(note) {
  // Convert thumbnail to base64 (for cards - always need it)
  if (note.thumbnail) {
    note.thumbnail = fileStorage.retrieveFromStorage(note.thumbnail);
  }
  // Keep attachment_full as-is (file: reference or base64)
  // Frontend will handle file: references by loading from /attachments/
  // This avoids sending huge base64 strings for large files!
  return note;
}

const {
  resolveAttachment,
  getAttachmentsForNotes,
  applyAttachments,
} = createAttachmentHelpers({ pool, fileStorage });

// ============= LARGE FILE DIRECT UPLOAD =============
const upload = createUploadMiddleware({ fileStorage });
registerUploadRoutes(app, { upload, fileStorage });

// ============= NOTE ATTACHMENTS API =============
registerAttachmentRoutes(app, { pool, fileStorage, upload });

// ============= PALETTE API =============
registerPaletteRoutes(app, { getPalettesDir });

// ============= VAULT API =============

registerVaultRoutes(app, {
  fileStorage,
  readLocalConfig,
  getSettingsFile,
  getPalettesDir,
});

// ============= AUTHORS API =============
registerAuthorRoutes(app, { pool });

// ============= SOURCES API =============
registerSourceRoutes(app, { pool });

// ============= TAGS API =============
registerTagRoutes(app, { pool });

// ============= QUOTES API =============

registerQuoteRoutes(app, {
  pool,
  fileStorage,
  getAllowedTypes: () => _allowedTypes,
  getModeName: () => _modeName,
  getAttachmentsForNotes,
  applyAttachments,
  retrieveQuoteImages,
  checkTagTablesExist,
  getTagsForNote,
  getTagsForNotes,
});

registerQuoteBulkRoutes(app, {
  pool,
  fileStorage,
  getAllowedTypes: () => _allowedTypes,
});

registerDedupRoutes(app, {
  pool,
  getAttachmentsForNotes,
  applyAttachments,
  retrieveQuoteImages,
  checkTagTablesExist,
  getTagsForNotes,
});

// ============= DATA EXPORT/IMPORT (JSON) =============
registerExportImportRoutes(app, {
  pool,
  fileStorage,
  getSettingsFile,
  fsImpl: fs,
});

// ============= EXPORT DB ATTACHMENTS =============
registerDbAttachmentExportRoutes(app, {
  pool,
  fileStorage,
  fsImpl: fs,
});

// ============= MIGRATE: DB base64 attachment_full -> disk files =============
registerAttachmentMigrationRoutes(app, {
  pool,
  fileStorage,
  fsImpl: fs,
});

// ============= PDF EXPORT =============
registerPdfExportRoutes(app, {
  fileStorage,
  getSettingsFile,
  fsImpl: fs,
});

// Start server
async function startServer() {
  try {
    if (process.env.SKIP_MIGRATE !== '1') {
      console.log('🔄 Running database migrations...');
      const { runMigrations } = require('../migrations/run-migrations');
      await runMigrations();
      console.log('✅ Migrations completed\n');
    } else {
      console.log('⏭️  Skipping migrations (SKIP_MIGRATE=1)\n');
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Local: http://localhost:${PORT}`);
      console.log(`Network: http://0.0.0.0:${PORT}`);
      instanceManager.attachLifecycleHooks(PORT, _modeName);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

// Keep the server alive — log unhandled errors instead of crashing
process.on('uncaughtException', (err) => {
  console.error('🔴 Uncaught Exception (server kept alive):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('🔴 Unhandled Rejection (server kept alive):', reason);
});

module.exports = {
  app,
  startServer,
};
