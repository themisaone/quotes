const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const archiver = require("archiver");
const pool = require("./db");
const fileStorage = require("./fileStorage");
const {
  checkTagTablesExist,
  getOrCreateTagIds,
  associateTagsWithNote,
  getTagsForNote,
  getTagsForNotes,
  parseTagInput,
} = require("./tagHelpers");
require("dotenv").config();

// ── Note text cleanup: strip Evernote artefacts, normalise empty content to '' ──
const _EN_MEDIA_RE = /<en-media[^>]*\/?>/gi;
const _EMPTY_HTML_RE = /^(\s|<br\s*\/?>|<p[^>]*>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>)*$/i;
function sanitizeNoteText(text) {
  if (!text) return '';
  const stripped = text.replace(_EN_MEDIA_RE, '');
  return _EMPTY_HTML_RE.test(stripped) ? '' : stripped;
}

const app = express();
const PORT = process.env.PORT || 4000;

// ── Active mode (set via MODE env var or PUT /api/mode, persisted in local.json) ──
const MODES_FILE = path.join(__dirname, '../config/modes.json');
function loadModes() {
  try {
    if (fs.existsSync(MODES_FILE)) return JSON.parse(fs.readFileSync(MODES_FILE, 'utf8'));
  } catch (_) {}
  return { DEFAULT: ['quote', 'note', 'historical'], ALL: ['quote', 'note', 'historical', 'puzzle', 'training'] };
}
const _modes = loadModes();

// Priority: MODE env var (npm run <mode>) > local.json activeMode (UI selector) > DEFAULT
function resolveInitialMode() {
  if (process.env.MODE) return process.env.MODE.toUpperCase();
  try {
    const local = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
    if (local.activeMode) return local.activeMode.toUpperCase();
  } catch (_) {}
  return 'DEFAULT';
}

let _modeName    = resolveInitialMode();
let _allowedTypes = _modes[_modeName] || _modes['DEFAULT'] || Object.values(_modes)[0];

function applyMode(newMode) {
  const name = newMode.toUpperCase();
  const types = _modes[name];
  if (!types) return false;
  _modeName    = name;
  _allowedTypes = types;
  return true;
}

console.log(`🎛️  Mode: ${_modeName} — types: [${_allowedTypes.join(', ')}]`);

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

// Derive vault-relative paths
function getSettingsFile() {
  const { vaultPath } = readLocalConfig();
  return vaultPath ? path.join(vaultPath, 'config', 'settings.json') : DEFAULT_SETTINGS_FILE;
}
function getPalettesDir() {
  const { vaultPath } = readLocalConfig();
  return vaultPath ? path.join(vaultPath, 'palettes') : DEFAULT_PALETTES_DIR;
}

// Keep SETTINGS_FILE as a compat alias (resolved at first use)
const SETTINGS_FILE = DEFAULT_SETTINGS_FILE; // only used during startup before vault init

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

// Prune unused authors/sources/tags — before static so POST is never mistaken for a file fetch
app.post("/api/maintenance/prune-unused-entities", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const authorsResult = await client.query(`
      DELETE FROM authors a
      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.author_id = a.id)
      RETURNING id
    `);
    const sourcesResult = await client.query(`
      DELETE FROM sources s
      WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.source_id = s.id)
      RETURNING id
    `);
    const tagsResult = await client.query(`
      DELETE FROM tags t
      WHERE NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.tag_id = t.id)
      RETURNING id
    `);

    await client.query("COMMIT");
    res.json({
      ok: true,
      authorsRemoved: authorsResult.rowCount,
      sourcesRemoved: sourcesResult.rowCount,
      tagsRemoved: tagsResult.rowCount,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("prune-unused-entities:", error);
    res.status(500).json({ error: error.message || "Prune failed" });
  } finally {
    client.release();
  }
});

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

// GET /api/mode — returns current mode and allowed note types
app.get('/api/mode', (req, res) => {
  res.json({
    mode:         _modeName,
    allowedTypes: _allowedTypes,
    allModes:     _modes
  });
});

// PUT /api/mode — switch mode at runtime and persist to local.json
app.put('/api/mode', (req, res) => {
  const { mode } = req.body;
  if (!mode) return res.status(400).json({ error: 'mode required' });
  if (!applyMode(mode)) {
    return res.status(400).json({ error: `Unknown mode "${mode}". Available: ${Object.keys(_modes).join(', ')}` });
  }
  // Persist so the next plain "npm start" resumes this mode
  // (npm run <mode> always overrides via env var, so this only affects bare "npm start")
  try {
    const local = fs.existsSync(LOCAL_FILE) ? JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')) : {};
    local.activeMode = _modeName;
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(local, null, 2));
  } catch (e) { console.warn('Could not persist mode:', e.message); }
  console.log(`🎛️  Mode switched to: ${_modeName} — types: [${_allowedTypes.join(', ')}]`);
  res.json({ mode: _modeName, allowedTypes: _allowedTypes });
});

// Get all settings
app.get('/api/settings', (req, res) => {
  try {
    // Default settings
    const defaultSettings = {
      noteTypes: [
        { value: 'quote',    label: 'Quotes',   icon: '💬', behavior: 'quote',    core: true,
          subTypes: [
            { value: 'BOOK',     label: 'Book',       icon: '📖' },
            { value: 'MOVIE-TV', label: 'Movies & TV', icon: '🎬' },
            { value: 'ASSORTED', label: 'Assorted',   icon: '📝' }
          ]
        },
        { value: 'note',     label: 'Notes',    icon: '📝', behavior: 'generic',  core: true },
        { value: 'training', label: 'Training', icon: '💪', behavior: 'training', core: true,
          subTypes: [
            { value: 'WEIGHTS', label: 'Weights', icon: '🏋️' },
            { value: 'CARDIO',  label: 'Cardio',  icon: '🏃' }
          ]
        },
        { value: 'puzzle',   label: 'Puzzles',  icon: '🧩', behavior: 'generic',  core: true }
      ],
      downscaleQuoteImages: true,
      externalStorageThreshold: 1,
      compactMode: false,
      enableTagOperations: true,
      enableQuoteMetaSearches: false,
      displayQuotesByRealSize: false,
      displayImageQuotesLong: false,
      showLongQuotesExpanded: false,
      displayScoreInCards: false,
      enableWordWrap: true,
      wordWrapChars: 66,
      colors: {
        button: '#1e40af',
        header: '#166534',
        tag: '#2d6a4f',
        delete: '#ef4444',
        cancel: '#6b7280',
        activeCounter: '#dc2626',
        totalCounter: '#047857',
        menu: '#2c3e50',
        appBg: '#f8fafc',
        modalFooter: '#fde68a'
      }
    };
    
    // Read from vault-aware path
    const settingsFile = getSettingsFile();
    if (fs.existsSync(settingsFile)) {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      res.json(settings);
    } else {
      const { vaultPath } = readLocalConfig();
      const vaultRoot = vaultPath && String(vaultPath).trim();
      // Do not mkdir/write under a host-only vault path (e.g. Docker without bind-mount) — that
      // would create the wrong tree inside the container and hide the real settings/colors/types.
      if (vaultRoot && !fs.existsSync(vaultRoot)) {
        if (fs.existsSync(DEFAULT_SETTINGS_FILE)) {
          const settings = JSON.parse(fs.readFileSync(DEFAULT_SETTINGS_FILE, 'utf8'));
          return res.json(settings);
        }
        return res.json(defaultSettings);
      }
      // Create file with defaults
      fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
      fs.writeFileSync(settingsFile, JSON.stringify(defaultSettings, null, 2));
      res.json(defaultSettings);
    }
  } catch (error) {
    console.error('Error reading settings:', error);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// Save settings
app.put('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    
    // Validate settings structure
    if (!settings.noteTypes || !Array.isArray(settings.noteTypes)) {
      return res.status(400).json({ error: 'Invalid settings structure: noteTypes array required' });
    }
    
    // If vault path is changing, save it to local.json and migrate settings file
    if (settings.vaultPath !== undefined) {
      const oldVaultPath = readLocalConfig().vaultPath || '';
      const newVaultPath = settings.vaultPath || '';
      if (newVaultPath !== oldVaultPath) {
        // Save vault path locally
        writeLocalConfig({ vaultPath: newVaultPath });
        // If moving to a vault, copy current settings.json there first
        if (newVaultPath) {
          const destSettings = path.join(newVaultPath, 'config', 'settings.json');
          fs.mkdirSync(path.dirname(destSettings), { recursive: true });
          if (!fs.existsSync(destSettings) && fs.existsSync(DEFAULT_SETTINGS_FILE)) {
            fs.copyFileSync(DEFAULT_SETTINGS_FILE, destSettings);
          }
          // Also copy palettes
          const destPalettes = path.join(newVaultPath, 'palettes');
          fs.mkdirSync(destPalettes, { recursive: true });
          if (fs.existsSync(DEFAULT_PALETTES_DIR)) {
            for (const f of fs.readdirSync(DEFAULT_PALETTES_DIR)) {
              if (f.endsWith('.json')) {
                const dest = path.join(destPalettes, f);
                if (!fs.existsSync(dest)) fs.copyFileSync(path.join(DEFAULT_PALETTES_DIR, f), dest);
              }
            }
          }
        }
        fileStorage.setAttachmentsDir(newVaultPath);
        fileStorage.ensureDirectories();
      }
      // Don't store vaultPath inside settings.json — it lives in local.json only
      delete settings.vaultPath;
    }

    // Write settings to vault-aware path
    const settingsFile = getSettingsFile();
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

    // Sync modes.json: keep ALL up-to-date and prune removed types from all modes
    try {
      const currentTypeValues = settings.noteTypes.map(t => t.value);
      const modesData = loadModes();

      // Ensure ALL mode exists and contains every configured note type
      if (!modesData.ALL) modesData.ALL = [];
      for (const val of currentTypeValues) {
        if (!modesData.ALL.includes(val)) modesData.ALL.push(val);
      }

      // Remove values that no longer exist in noteTypes from every mode array
      for (const modeName of Object.keys(modesData)) {
        modesData[modeName] = modesData[modeName].filter(v => currentTypeValues.includes(v));
      }

      fs.writeFileSync(MODES_FILE, JSON.stringify(modesData, null, 2));

      // Reflect changes in the in-memory _modes object (mutate in place)
      for (const [k, v] of Object.entries(modesData)) _modes[k] = v;
      for (const k of Object.keys(_modes)) { if (!modesData[k]) delete _modes[k]; }

      // Re-resolve _allowedTypes for the active mode
      if (_modes[_modeName]) {
        _allowedTypes = _modes[_modeName];
      }
    } catch (modeErr) {
      console.warn('⚠️  Could not sync modes.json:', modeErr.message);
    }

    // Fix notes whose sub-type was removed from settings.
    // For every note_type that has configured sub-types, any note whose `type`
    // column is no longer in the valid list gets reset to ASSORTED (if that
    // sub-type exists) or NULL.
    try {
      for (const nt of settings.noteTypes) {
        if (!Array.isArray(nt.subTypes) || nt.subTypes.length === 0) continue;
        const validValues = nt.subTypes.map(s => s.value.toUpperCase());
        const hasAssorted = validValues.includes('ASSORTED');
        const fallback    = hasAssorted ? 'ASSORTED' : null;
        const updated = await pool.query(
          `UPDATE notes
              SET type = $1
            WHERE note_type = $2
              AND type IS NOT NULL
              AND UPPER(type) != ALL($3::text[])
            RETURNING id, type`,
          [fallback, nt.value, validValues]
        );
        if (updated.rowCount > 0) {
          console.log(`⚙️  Reset ${updated.rowCount} note(s) of type "${nt.value}" to "${fallback ?? 'NULL'}" (sub-type removed from settings)`);
        }
      }
    } catch (cleanupErr) {
      console.warn('⚠️  Could not clean up stale sub-types in notes:', cleanupErr.message);
    }

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
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

// Resolve storage references in a single attachment row
function resolveAttachment(att) {
  if (!att) return att;
  return {
    ...att,
    thumbnail: att.thumbnail ? fileStorage.retrieveFromStorage(att.thumbnail) : null,
    // attachment_full kept as-is (file: ref or base64) — same policy as notes
  };
}

// Fetch all attachments for a list of note IDs in one query.
// Returns a Map<noteId, attachment[]> sorted by position.
async function getAttachmentsForNotes(noteIds) {
  if (!noteIds || noteIds.length === 0) return new Map();
  try {
    const result = await pool.query(
      `SELECT * FROM note_attachments
       WHERE note_id = ANY($1::int[])
       ORDER BY note_id, position`,
      [noteIds]
    );
    const map = new Map();
    for (const row of result.rows) {
      if (!map.has(row.note_id)) map.set(row.note_id, []);
      map.get(row.note_id).push(resolveAttachment(row));
    }
    return map;
  } catch (_) {
    // table may not exist yet during startup migration
    return new Map();
  }
}

// Attach the `attachments` array to a note and keep flat fields in sync with [0].
function applyAttachments(note, attachments) {
  const list = attachments || [];
  const first = list[0] || null;
  return {
    ...note,
    attachments: list,
    // Keep flat fields populated from first attachment so all existing
    // frontend code continues to work unchanged.
    thumbnail:       first ? first.thumbnail       : note.thumbnail,
    attachment_full: first ? first.attachment_full : note.attachment_full,
    attachment_type: first ? first.attachment_type : note.attachment_type,
  };
}

// ============= LARGE FILE DIRECT UPLOAD =============
// Multer: store directly on disk (no base64, no memory pressure)
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use req.query.folder — req.body fields are not parsed yet when
    // this callback runs (the file field precedes text fields in FormData).
    const folder = req.query.folder || 'note';
    const dir = path.join(fileStorage.ATTACHMENTS_DIR, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Temp name — server will rename after the note is saved
    const ext = path.extname(file.originalname) || '.' + (fileStorage.MIME_TO_EXT[file.mimetype] || 'bin');
    cb(null, `tmp_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage: multerStorage });

// POST /api/upload-attachment
// Accepts: multipart/form-data with field "file" + query param ?folder=
// Returns: { fileRef: "file:notes/tmp_12345.pdf:application/pdf", filename, sizeMB }
app.post('/api/upload-attachment', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const folder  = req.query.folder || 'note';
    let   relPath = `${folder}/${req.file.filename}`;
    let   mimeType = req.file.mimetype || fileStorage.getMimeFromExtension(path.extname(req.file.filename).slice(1));

    // Transcode non-PCM audio (e.g. IMA ADPCM WAV) to PCM WAV so browsers can play it.
    // Only applies to WAV uploads — other formats are left as-is.
    if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav' || mimeType === 'audio/wave') {
      const fullPath = path.join(fileStorage.getAttachmentsDir(), relPath);
      const pcmPath  = fullPath.replace(/\.wav$/i, '_pcm.wav');
      try {
        await new Promise((resolve, reject) => {
          const { execFile } = require('child_process');
          execFile('ffmpeg', ['-y', '-i', fullPath, '-acodec', 'pcm_s16le', pcmPath],
            (err, stdout, stderr) => {
              if (err) reject(err); else resolve();
            }
          );
        });
        // Replace original with PCM version
        fs.renameSync(pcmPath, fullPath);
        mimeType = 'audio/wav';
      } catch (transcodeErr) {
        // ffmpeg not available or failed — keep original, warn
        console.warn(`⚠️  WAV transcode failed (file kept as-is): ${transcodeErr.message}`);
        if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);
      }
    }

    const sizeMB  = (fs.statSync(path.join(fileStorage.getAttachmentsDir(), relPath)).size / 1024 / 1024).toFixed(2);
    const fileRef = fileStorage.createFileReference(relPath, mimeType);
    res.json({ fileRef, filename: req.file.originalname, sizeMB });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ============= PALETTE API =============

// GET /api/palettes — list all palette names
app.get('/api/palettes', (req, res) => {
  try {
    const dir = getPalettesDir();
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''))
      .sort();
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/palettes/:name — load a palette
app.get('/api/palettes/:name', (req, res) => {
  try {
    const file = path.join(getPalettesDir(), `${req.params.name}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Palette not found' });
    res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/palettes/:name — save/overwrite a palette
app.put('/api/palettes/:name', (req, res) => {
  try {
    const dir = getPalettesDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${req.params.name}.json`);
    fs.writeFileSync(file, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/palettes/:name — delete a palette
app.delete('/api/palettes/:name', (req, res) => {
  try {
    const file = path.join(getPalettesDir(), `${req.params.name}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============= VAULT API =============

// GET /api/vault/info — current vault path + file stats
app.get('/api/vault/info', (req, res) => {
  const attachDir = fileStorage.getAttachmentsDir();
  const { vaultPath } = readLocalConfig();
  try {
    let totalFiles = 0, totalBytes = 0;
    const walk = (d) => {
      if (!fs.existsSync(d)) return;
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full); }
        else { totalFiles++; totalBytes += stat.size; }
      }
    };
    walk(attachDir);
    const settingsFile = getSettingsFile();
    const vaultRoot = vaultPath && String(vaultPath).trim();
    let settingsNoteTypeCount = null;
    let settingsNoteTypeValues = null;
    let settingsParseError = null;
    try {
      if (fs.existsSync(settingsFile)) {
        const raw = fs.readFileSync(settingsFile, 'utf8');
        const parsed = JSON.parse(raw);
        settingsNoteTypeCount = Array.isArray(parsed.noteTypes) ? parsed.noteTypes.length : 0;
        settingsNoteTypeValues = Array.isArray(parsed.noteTypes)
          ? parsed.noteTypes.map((t) => (t && t.value) || null).filter(Boolean)
          : null;
      }
    } catch (e) {
      settingsNoteTypeCount = null;
      settingsNoteTypeValues = null;
      settingsParseError = e.message;
    }
    res.json({
      vaultPath: vaultPath || '',
      vaultRootExists: vaultRoot ? fs.existsSync(vaultRoot) : null,
      attachmentsDir: attachDir,
      settingsFile,
      settingsFileExists: fs.existsSync(settingsFile),
      settingsNoteTypeCount,
      settingsNoteTypeValues,
      settingsParseError,
      palettesDir: getPalettesDir(),
      isDefault: !vaultPath,
      totalFiles,
      totalSizeMB: (totalBytes / 1024 / 1024).toFixed(1)
    });
  } catch (e) {
    res.json({ vaultPath: vaultPath || '', error: e.message });
  }
});

// POST /api/vault/validate — check if a path exists and is writable
app.post('/api/vault/validate', (req, res) => {
  const { vaultPath } = req.body;
  if (!vaultPath || !vaultPath.trim()) {
    return res.json({ valid: true, isDefault: true, message: 'Will use default: ' + fileStorage.DEFAULT_ATTACHMENTS_DIR });
  }
  const p = vaultPath.trim();
  try {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
    // Test write access
    const testFile = path.join(p, '.write-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    res.json({ valid: true, message: 'Path is accessible ✓' });
  } catch (e) {
    res.json({ valid: false, message: 'Cannot access path: ' + e.message });
  }
});

// POST /api/vault/move — copy all files from current vault to a new path
app.post('/api/vault/move', async (req, res) => {
  const { newPath } = req.body;
  if (!newPath || !newPath.trim()) {
    return res.status(400).json({ error: 'newPath required' });
  }
  const dest = newPath.trim();
  const src  = fileStorage.getAttachmentsDir();
  if (dest === src) return res.json({ success: true, moved: 0, message: 'Already at that path' });

  try {
    let moved = 0, errors = [];
    const copyDir = (from, to) => {
      if (!fs.existsSync(from)) return;
      fs.mkdirSync(to, { recursive: true });
      for (const f of fs.readdirSync(from)) {
        const srcF = path.join(from, f);
        const dstF = path.join(to, f);
        if (fs.statSync(srcF).isDirectory()) {
          copyDir(srcF, dstF);
        } else {
          try { fs.copyFileSync(srcF, dstF); moved++; } catch(e) { errors.push(f + ': ' + e.message); }
        }
      }
    };
    copyDir(src, dest);
    res.json({ success: true, moved, errors, message: `Copied ${moved} file(s) to ${dest}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============= AUTHORS API =============

// Get all authors (with optional search)
app.get("/api/authors", async (req, res) => {
    try {
        const { search } = req.query;
        let query = `
            SELECT a.*, 
                   COUNT(q.id) as quote_count
            FROM authors a
            LEFT JOIN notes q ON a.id = q.author_id
        `;
        const params = [];

        if (search) {
      query += " WHERE a.name ILIKE $1";
            params.push(`%${search}%`);
        }

    query += " GROUP BY a.id ORDER BY a.name ASC";

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
    console.error("Error fetching authors:", error);
    res.status(500).json({ error: "Failed to fetch authors" });
    }
});

// Get single author
app.get("/api/authors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT a.*, COUNT(q.id) as quote_count 
      FROM authors a 
      LEFT JOIN notes q ON a.id = q.author_id 
      WHERE a.id = $1 
      GROUP BY a.id
    `,
      [id],
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Author not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching author:", error);
    res.status(500).json({ error: "Failed to fetch author" });
  }
});

// Create or get author
app.post("/api/authors", async (req, res) => {
  try {
    const { name, thumbnail = "" } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Author name is required" });
    }

    // Try to insert, or return existing if already exists
    const result = await pool.query(
      `INSERT INTO authors (name, image) 
       VALUES ($1, $2) 
       ON CONFLICT (name) DO UPDATE SET image = COALESCE(NULLIF($2, ''), authors.image)
       RETURNING *`,
      [name.trim(), thumbnail],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating author:", error);
    res.status(500).json({ error: "Failed to create author" });
  }
});

/**
 * Author/source PUT bodies: if the client sends `image: null` to clear a portrait,
 * we must not use `image ?? legacyThumbnail` — that yields `undefined` when legacy
 * is absent, so the UPDATE skips and the old image stays in the DB.
 */
function pickEntityImagePayload(body) {
  if (Object.prototype.hasOwnProperty.call(body, "image")) return body.image;
  if (Object.prototype.hasOwnProperty.call(body, "thumbnail")) return body.thumbnail;
  return undefined;
}

// Update author (rename with auto-merge detection)
app.put("/api/authors/:id", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    const { id } = req.params;
    let { name, description } = req.body;
    const thumbnail = pickEntityImagePayload(req.body);

    // Validate: allow null/empty to clear; otherwise expect a data URL
    if (
      thumbnail != null &&
      thumbnail !== "" &&
      !String(thumbnail).startsWith("data:")
    ) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    // Check if author exists
    const authorCheck = await client.query(
      "SELECT id, name, image FROM authors WHERE id = $1",
      [id]
    );
    
    if (authorCheck.rows.length === 0) {
      return res.status(404).json({ error: "Author not found" });
    }
    
    const oldName = authorCheck.rows[0].name;
    
    // If name is being changed, check for merge
    if (name && name.trim() !== oldName) {
      const trimmedName = name.trim();
      
      // Check if target name already exists
      const existingAuthor = await client.query(
        "SELECT id, name FROM authors WHERE LOWER(name) = LOWER($1) AND id != $2",
        [trimmedName, id]
      );
      
      if (existingAuthor.rows.length > 0) {
        // Author with this name exists - need to merge
        const targetAuthorId = existingAuthor.rows[0].id;
        
        // Move all quotes from old author to existing author
        await client.query(
          "UPDATE notes SET author_id = $1 WHERE author_id = $2",
          [targetAuthorId, id]
        );
        
        // Delete the old author
        await client.query("DELETE FROM authors WHERE id = $1", [id]);
        
        await client.query("COMMIT");
        
        return res.json({
          merged: true,
          oldName,
          newName: existingAuthor.rows[0].name,
          targetAuthorId,
          message: `Author "${oldName}" merged into existing author "${existingAuthor.rows[0].name}"`
        });
      }
    }
    
    // Simple update (rename and/or thumbnail update and/or description update)
    // Note: For thumbnail, we need to allow explicit NULL to clear it
    const updateParams = [];
    const updateFields = [];
    let paramCount = 1;
    
    if (name !== undefined && name !== null) {
      updateFields.push(`name = $${paramCount}`);
      updateParams.push(name.trim());
      paramCount++;
    }
    
    if (description !== undefined) {
      updateFields.push(`description = $${paramCount}`);
      updateParams.push(description?.trim() || '');
      paramCount++;
    }
    
    // Image: explicitly allow null to clear it
    if (thumbnail !== undefined) {
      updateFields.push(`image = $${paramCount}`);
      updateParams.push(thumbnail); // Can be null to clear
      paramCount++;
    }
    
    updateParams.push(id); // WHERE clause
    
    const result = await client.query(
      `UPDATE authors 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      updateParams
    );

    await client.query("COMMIT");

    res.json({
      merged: false,
      oldName,
      newName: result.rows[0].name,
      author: result.rows[0],
      message: name ? `Author renamed from "${oldName}" to "${result.rows[0].name}"` : "Author updated"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating author:", error);
    res.status(500).json({ error: "Failed to update author" });
  } finally {
    client.release();
  }
});

// Delete author (only if no quotes)
app.delete("/api/authors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if author has any quotes
    const quoteCheck = await pool.query(
      "SELECT COUNT(*) as count FROM notes WHERE author_id = $1",
      [id],
    );
    
    if (parseInt(quoteCheck.rows[0].count) > 0) {
      return res
        .status(400)
        .json({ error: "Cannot delete author with existing quotes" });
    }
    
    const result = await pool.query(
      "DELETE FROM authors WHERE id = $1 RETURNING *",
      [id],
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Author not found" });
    }
    
    res.json({ message: "Author deleted successfully" });
  } catch (error) {
    console.error("Error deleting author:", error);
    res.status(500).json({ error: "Failed to delete author" });
  }
});

// ============= SOURCES API =============

// Get all sources (with optional search and type filter)
app.get("/api/sources", async (req, res) => {
    try {
        const { search, type } = req.query;
        let query = `
            SELECT s.*, 
                   COUNT(q.id) as quote_count,
                   (
                       SELECT a.name 
                       FROM notes q2 
                       JOIN authors a ON q2.author_id = a.id 
                       WHERE q2.source_id = s.id 
                       GROUP BY a.id, a.name 
                       ORDER BY COUNT(*) DESC 
                       LIMIT 1
                   ) as primary_author_name,
                   (
                       SELECT a.id 
                       FROM notes q2 
                       JOIN authors a ON q2.author_id = a.id 
                       WHERE q2.source_id = s.id 
                       GROUP BY a.id 
                       ORDER BY COUNT(*) DESC 
                       LIMIT 1
                   ) as primary_author_id
            FROM sources s
            LEFT JOIN notes q ON s.id = q.source_id
            WHERE 1=1
        `;
        const params = [];
        let paramCounter = 1;

        if (search) {
            query += ` AND s.name ILIKE $${paramCounter}`;
            params.push(`%${search}%`);
            paramCounter++;
        }
        
        if (type) {
            query += ` AND s.type = $${paramCounter}`;
            params.push(type);
            paramCounter++;
        }

    query += " GROUP BY s.id ORDER BY s.name ASC";

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
    console.error("Error fetching sources:", error);
    res.status(500).json({ error: "Failed to fetch sources" });
    }
});

// Get single source
app.get("/api/sources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT s.*, COUNT(q.id) as quote_count 
      FROM sources s 
      LEFT JOIN notes q ON s.id = q.source_id 
      WHERE s.id = $1 
      GROUP BY s.id
    `,
      [id],
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Source not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching source:", error);
    res.status(500).json({ error: "Failed to fetch source" });
  }
});

// Create or get source
app.post("/api/sources", async (req, res) => {
  try {
    const { name, thumbnail = "", type = "BOOK" } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Source name is required" });
    }

    // Try to insert, or return existing if already exists
    const result = await pool.query(
      `INSERT INTO sources (name, image, type) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (name) DO UPDATE SET image = COALESCE(NULLIF($2, ''), sources.image), type = COALESCE(NULLIF($3, ''), sources.type)
       RETURNING *`,
      [name.trim(), thumbnail, type],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating source:", error);
    res.status(500).json({ error: "Failed to create source" });
  }
});

// Update source (rename with auto-merge detection)
app.put("/api/sources/:id", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    const { id } = req.params;
    let { name, type } = req.body;
    const thumbnail = pickEntityImagePayload(req.body);

    if (
      thumbnail != null &&
      thumbnail !== "" &&
      !String(thumbnail).startsWith("data:")
    ) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    // Check if source exists
    const sourceCheck = await client.query(
      "SELECT id, name, image, type FROM sources WHERE id = $1",
      [id]
    );
    
    if (sourceCheck.rows.length === 0) {
      return res.status(404).json({ error: "Source not found" });
    }
    
    const oldName = sourceCheck.rows[0].name;
    
    // If name is being changed, check for merge
    if (name && name.trim() !== oldName) {
      const trimmedName = name.trim();
      
      // Check if target name already exists
      const existingSource = await client.query(
        "SELECT id, name FROM sources WHERE LOWER(name) = LOWER($1) AND id != $2",
        [trimmedName, id]
      );
      
      if (existingSource.rows.length > 0) {
        // Source with this name exists - need to merge
        const targetSourceId = existingSource.rows[0].id;
        
        // Move all quotes from old source to existing source
        await client.query(
          "UPDATE notes SET source_id = $1 WHERE source_id = $2",
          [targetSourceId, id]
        );
        
        // Delete the old source
        await client.query("DELETE FROM sources WHERE id = $1", [id]);
        
        await client.query("COMMIT");
        
        return res.json({
          merged: true,
          oldName,
          newName: existingSource.rows[0].name,
          targetSourceId,
          message: `Source "${oldName}" merged into existing source "${existingSource.rows[0].name}"`
        });
      }
    }
    
    // Simple update (rename and/or thumbnail/type update)
    // Note: For thumbnail, we need to allow explicit NULL to clear it
    const updateParams = [];
    const updateFields = [];
    let paramCount = 1;
    
    if (name !== undefined && name !== null) {
      updateFields.push(`name = $${paramCount}`);
      updateParams.push(name.trim());
      paramCount++;
    }
    
    // Image: explicitly allow null to clear it
    if (thumbnail !== undefined) {
      updateFields.push(`image = $${paramCount}`);
      updateParams.push(thumbnail); // Can be null to clear
      paramCount++;
    }
    
    if (type !== undefined && type !== null) {
      updateFields.push(`type = $${paramCount}`);
      updateParams.push(type);
      paramCount++;
    }
    
    updateParams.push(id); // WHERE clause
    
    const result = await client.query(
      `UPDATE sources 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      updateParams
    );

    await client.query("COMMIT");

    res.json({
      merged: false,
      oldName,
      newName: result.rows[0].name,
      source: result.rows[0],
      message: name ? `Source renamed from "${oldName}" to "${result.rows[0].name}"` : "Source updated"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating source:", error);
    res.status(500).json({ error: "Failed to update source" });
  } finally {
    client.release();
  }
});

// Delete source (only if no quotes)
app.delete("/api/sources/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if source has any quotes
    const quoteCheck = await pool.query(
      "SELECT COUNT(*) as count FROM notes WHERE source_id = $1",
      [id],
    );
    
    if (parseInt(quoteCheck.rows[0].count) > 0) {
      return res
        .status(400)
        .json({ error: "Cannot delete source with existing quotes" });
    }
    
    const result = await pool.query(
      "DELETE FROM sources WHERE id = $1 RETURNING *",
      [id],
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Source not found" });
    }
    
    res.json({ message: "Source deleted successfully" });
  } catch (error) {
    console.error("Error deleting source:", error);
    res.status(500).json({ error: "Failed to delete source" });
  }
});

// ============= QUOTES API =============

/**
 * Parse search query with AND/OR operators
 * Supports:
 * - "term1 && term2" = AND search (both terms must be present)
 * - "term1 || term2" = OR search (at least one term must be present)
 * - "term" = simple search (no operator)
 * Note: Operators must have spaces around them to avoid conflicts with content containing | or &
 * @param {string} searchQuery - The search query
 * @returns {Object} - { operator: 'AND'|'OR'|'SIMPLE', terms: string[] }
 */
function parseSearchQuery(searchQuery) {
  if (!searchQuery) return { operator: 'SIMPLE', terms: [] };
  
  // Check for AND operator (&&) with spaces around it
  if (searchQuery.includes(' && ')) {
    const terms = searchQuery.split(' && ').map(t => t.trim()).filter(t => t);
    return { operator: 'AND', terms };
  }
  
  // Check for OR operator (||) with spaces around it
  if (searchQuery.includes(' || ')) {
    const terms = searchQuery.split(' || ').map(t => t.trim()).filter(t => t);
    return { operator: 'OR', terms };
  }
  
  // Simple search (no operator)
  return { operator: 'SIMPLE', terms: [searchQuery.trim()] };
}

/**
 * Build SQL condition for text search with operators
 * @param {string} searchQuery - The search query
 * @param {string} columnName - The column to search (e.g., 'q.note_text')
 * @param {number} paramCounter - Current parameter counter
 * @param {Array} params - Parameters array to push to
 * @returns {Object} - { condition: string, newParamCounter: number }
 */
function buildTextSearchCondition(searchQuery, columnName, paramCounter, params) {
  const { operator, terms } = parseSearchQuery(searchQuery);
  
  if (terms.length === 0) {
    return { condition: '', newParamCounter: paramCounter };
  }

  // columnName may be a string or an array of columns to search with OR
  const columns = Array.isArray(columnName) ? columnName : [columnName];
  // Build a per-term match: one param, checked against all columns with OR
  const termMatch = (n) => columns.length === 1
    ? `${columns[0]} ILIKE $${n}`
    : `(${columns.map(c => `${c} ILIKE $${n}`).join(' OR ')})`;
  
  if (operator === 'SIMPLE') {
    params.push(`%${terms[0]}%`);
    return {
      condition: ` AND ${termMatch(paramCounter)}`,
      newParamCounter: paramCounter + 1
    };
  }
  
  if (operator === 'AND') {
    // All terms must be present
    const conditions = terms.map((term) => {
      params.push(`%${term}%`);
      const condition = termMatch(paramCounter);
      paramCounter++;
      return condition;
    });
    return {
      condition: ` AND (${conditions.join(' AND ')})`,
      newParamCounter: paramCounter
    };
  }
  
  if (operator === 'OR') {
    // At least one term must be present
    const conditions = terms.map((term) => {
      params.push(`%${term}%`);
      const condition = termMatch(paramCounter);
      paramCounter++;
      return condition;
    });
    return {
      condition: ` AND (${conditions.join(' OR ')})`,
      newParamCounter: paramCounter
    };
  }
  
  return { condition: '', newParamCounter: paramCounter };
}

/**
 * Build SQL condition for tag search with operators
 * @param {string} searchQuery - The search query
 * @param {number} paramCounter - Current parameter counter
 * @param {Array} params - Parameters array to push to
 * @returns {Object} - { condition: string, newParamCounter: number }
 */
function buildTagSearchCondition(searchQuery, paramCounter, params) {
  const { operator, terms } = parseSearchQuery(searchQuery);
  
  if (terms.length === 0) {
    return { condition: '', newParamCounter: paramCounter };
  }
  
  if (operator === 'SIMPLE') {
    // Simple tag search (comma-separated = AND; prefix ! = NOT)
    const searchTags = terms[0].split(',').map(t => t.trim()).filter(t => t);
    const conditions = searchTags.map((tag) => {
      const exclude = tag.startsWith('!');
      const tagName = exclude ? tag.slice(1).trim() : tag;
      if (!tagName) return '';
      params.push(`%${tagName}%`);
      const existsClause = `EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name ILIKE $${paramCounter}
      )`;
      paramCounter++;
      return exclude ? ` AND NOT ${existsClause}` : ` AND ${existsClause}`;
    }).filter(c => c);
    return {
      condition: conditions.join(''),
      newParamCounter: paramCounter
    };
  }
  
  if (operator === 'AND') {
    // All positive tags must be present; !-prefixed tags must be absent
    const conditions = terms.map((tag) => {
      const exclude = tag.startsWith('!');
      const tagName = exclude ? tag.slice(1).trim() : tag;
      if (!tagName) return '';
      params.push(`%${tagName}%`);
      const existsClause = `EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name ILIKE $${paramCounter}
      )`;
      paramCounter++;
      return exclude ? ` AND NOT ${existsClause}` : ` AND ${existsClause}`;
    }).filter(c => c);
    return {
      condition: conditions.join(''),
      newParamCounter: paramCounter
    };
  }
  
  if (operator === 'OR') {
    // At least one tag must be present
    terms.forEach(tag => {
      params.push(`%${tag}%`);
    });
    const placeholders = terms.map((_, i) => `$${paramCounter + i}`).join(', ');
    const condition = ` AND EXISTS (
      SELECT 1 FROM note_tags qt 
      JOIN tags t ON qt.tag_id = t.id 
      WHERE qt.note_id = q.id AND t.name ILIKE ANY(ARRAY[${placeholders}])
    )`;
    return {
      condition,
      newParamCounter: paramCounter + terms.length
    };
  }
  
  return { condition: '', newParamCounter: paramCounter };
}

// Get total quote count
app.get("/api/quotes/count", async (req, res) => {
  try {
    const { quote, author, source, tags, score, types, note_type, training_types, hasAuthor, hasSource, hasNote, hasTags, hasImage, hasImageType, hasTranslationGroup, hasMultipleAttachments, hasTitle, hasText } = req.query;
    const { generic_sub_types } = req.query;
    
    // Build filtered count query (with all filters)
    let query = `
      SELECT COUNT(*) as count
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramCounter = 1;

    // Note type filter (also applies mode restriction when no specific type is requested)
    if (note_type) {
      query += ` AND q.note_type = $${paramCounter}`;
      params.push(note_type);
      paramCounter++;
    } else {
      query += ` AND q.note_type = ANY($${paramCounter})`;
      params.push(_allowedTypes);
      paramCounter++;
    }

    // Text search with AND/OR operators
    if (quote) {
      const { condition, newParamCounter } = buildTextSearchCondition(quote, ['q.note_text', 'q.note_title'], paramCounter, params);      query += condition;
      paramCounter = newParamCounter;
    }

    if (author) {
      query += ` AND a.name ILIKE $${paramCounter}`;
      params.push(`%${author}%`);
      paramCounter++;
    }

    if (source) {
      query += ` AND s.name ILIKE $${paramCounter}`;
      params.push(`%${source}%`);
      paramCounter++;
    }

    // Tag search with AND/OR operators
    if (tags) {
      const { condition, newParamCounter } = buildTagSearchCondition(tags, paramCounter, params);
      query += condition;
      paramCounter = newParamCounter;
    }
    
    // Filter by quote source types
    if (types) {
      const typeArray = types.split(",").filter((t) => t);
      const totalTypes = 6;
      if (typeArray.length > 0 && typeArray.length < totalTypes) {
        if (note_type === 'quote') {
          query += ` AND q.type = ANY($${paramCounter})`;
        } else {
          query += ` AND (q.note_type != 'quote' OR q.type = ANY($${paramCounter}))`;
        }
        params.push(typeArray);
        paramCounter++;
      }
    }

    // Training types filter
    if (training_types) {
      const trainingTypeArray = training_types.split(",").filter((t) => t);
      if (trainingTypeArray.length > 0) {
        if (note_type === 'training') {
          query += ` AND q.type = ANY($${paramCounter})`;
        } else {
          query += ` AND (q.note_type != 'training' OR q.type = ANY($${paramCounter}))`;
        }
        params.push(trainingTypeArray);
        paramCounter++;
      }
    }

    // Generic sub-type filter (for generic-behavior note types with configured sub-types)
    if (generic_sub_types) {
      const genericSubTypeArray = generic_sub_types.split(",").filter((t) => t);
      if (genericSubTypeArray.length > 0) {
        query += ` AND q.type = ANY($${paramCounter})`;
        params.push(genericSubTypeArray);
        paramCounter++;
      }
    }
    
    // Year filter for training notes - filter by year TAG instead of date
    if (req.query.year) {
      query += ` AND EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name = $${paramCounter}
      )`;
      params.push(req.query.year.toString());
      paramCounter++;
    }
    
    // Month filter for training notes - filter by month TAG instead of date
    if (req.query.month) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = monthNames[parseInt(req.query.month) - 1];
      
      query += ` AND EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name = $${paramCounter}
      )`;
      params.push(monthName);
      paramCounter++;
    }

    // Score filter with enhanced syntax
    if (score) {
      // Enhanced score search syntax:
      // "5" = exact match (5)
      // "5+" = 5 and higher (5, 6)
      // "3-5" = range (3, 4, 5)
      
      if (score.includes('-')) {
        // Range: "3-5"
        const [min, max] = score.split('-').map(s => s.trim());
        if (min && max && !isNaN(min) && !isNaN(max)) {
          query += ` AND q.score >= $${paramCounter} AND q.score <= $${paramCounter + 1}`;
          params.push(min, max);
          paramCounter += 2;
        }
      } else if (score.endsWith('+')) {
        // Minimum: "5+"
        const min = score.replace('+', '').trim();
        if (min && !isNaN(min)) {
          query += ` AND q.score >= $${paramCounter}`;
          params.push(min);
          paramCounter++;
        }
      } else {
        // Exact match: "5"
        query += ` AND q.score = $${paramCounter}`;
        params.push(score.trim());
        paramCounter++;
      }
    }

    // Metadata filters
    if (hasAuthor === 'true') {
      query += ` AND q.author_id IS NOT NULL`;
    } else if (hasAuthor === 'false') {
      query += ` AND q.author_id IS NULL`;
    }

    if (hasSource === 'true') {
      query += ` AND q.source_id IS NOT NULL`;
    } else if (hasSource === 'false') {
      query += ` AND q.source_id IS NULL`;
    }

    if (hasNote === 'true') {
      query += ` AND q.comment IS NOT NULL AND q.comment != ''`;
    } else if (hasNote === 'false') {
      query += ` AND (q.comment IS NULL OR q.comment = '')`;
    }

    if (hasTags === 'true') {
      query += ` AND EXISTS (SELECT 1 FROM note_tags WHERE note_id = q.id)`;
    } else if (hasTags === 'false') {
      query += ` AND NOT EXISTS (SELECT 1 FROM note_tags WHERE note_id = q.id)`;
    }

    if (hasImage === 'true') {
      query += ` AND q.attachment_full IS NOT NULL AND q.attachment_full != ''`;
    } else if (hasImage === 'false') {
      query += ` AND (q.attachment_full IS NULL OR q.attachment_full = '')`;
    }

    if (hasImageType === 'true') {
      query += ` AND q.attachment_full IS NOT NULL AND q.attachment_full != '' AND q.attachment_type = 'image'`;
    } else if (hasImageType === 'false') {
      query += ` AND q.attachment_full IS NOT NULL AND q.attachment_full != '' AND (q.attachment_type IS NULL OR q.attachment_type != 'image')`;
    }

    if (hasTranslationGroup === 'true') {
      query += ` AND q.translation_group IS NOT NULL AND q.translation_group != ''`;
    } else if (hasTranslationGroup === 'false') {
      query += ` AND (q.translation_group IS NULL OR q.translation_group = '')`;
    }

    if (hasMultipleAttachments === 'true') {
      query += ` AND (SELECT COUNT(*) FROM note_attachments WHERE note_id = q.id) > 1`;
    } else if (hasMultipleAttachments === 'false') {
      query += ` AND (SELECT COUNT(*) FROM note_attachments WHERE note_id = q.id) <= 1`;
    }

    if (hasTitle === 'true') {
      query += ` AND q.note_title IS NOT NULL AND q.note_title != '' AND q.note_title != 'No title'`;
    } else if (hasTitle === 'false') {
      query += ` AND (q.note_title IS NULL OR q.note_title = '' OR q.note_title = 'No title')`;
    }

    if (hasText === 'true') {
      query += ` AND q.note_text IS NOT NULL AND q.note_text != ''`;
    } else if (hasText === 'false') {
      query += ` AND (q.note_text IS NULL OR q.note_text = '')`;
    }

    if (req.query.hideEncryptedNotes === 'true') {
      query += ` AND q.attachment_type IS DISTINCT FROM 'encrypted'`
             + ` AND NOT EXISTS (SELECT 1 FROM note_attachments WHERE note_id = q.id AND attachment_type = 'encrypted')`;
    }

    if (req.query.hideTag) {
      query += ` AND NOT EXISTS (
        SELECT 1 FROM note_tags nt
        JOIN tags t ON nt.tag_id = t.id
        WHERE nt.note_id = q.id AND LOWER(t.name) = LOWER($${paramCounter})
      )`;
      params.push(req.query.hideTag);
      paramCounter++;
    }

    // Find by ID
    if (req.query.noteId && !isNaN(parseInt(req.query.noteId))) {
      query += ` AND q.id = $${paramCounter}`;
      params.push(parseInt(req.query.noteId));
      paramCounter++;
    }

    // Get filtered count
    const filteredResult = await pool.query(query, params);
    const filteredCount = parseInt(filteredResult.rows[0].count);
    
    // Get type-specific total (only note_type filter, no other filters)
    let typeTotal = null;
    if (note_type) {
      const typeQuery = `SELECT COUNT(*) as count FROM notes WHERE note_type = $1`;
      const typeResult = await pool.query(typeQuery, [note_type]);
      typeTotal = parseInt(typeResult.rows[0].count);
    }
    
    // Get grand total (no filters)
    const totalQuery = `SELECT COUNT(*) as count FROM notes`;
    const totalResult = await pool.query(totalQuery);
    const grandTotal = parseInt(totalResult.rows[0].count);
    
    res.json({ 
      count:     filteredCount,
      typeTotal: typeTotal,
      grandTotal: grandTotal
    });
  } catch (error) {
    console.error("Error fetching quote count:", error);
    res.status(500).json({ error: "Failed to fetch quote count" });
  }
});

// Get available years from training notes (MUST come before /api/quotes general route)
// Returns years from tags (4-digit tag names) instead of from note_date
app.get("/api/quotes/training-years", async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT t.name as year
      FROM tags t
      JOIN note_tags qt ON t.id = qt.tag_id
      JOIN notes q ON qt.note_id = q.id
      WHERE q.note_type = 'training' 
        AND t.name ~ '^[0-9]{4}$'
      ORDER BY t.name DESC
    `;
    const result = await pool.query(query);
    const years = result.rows.map(row => parseInt(row.year));
    res.json({ years });
  } catch (error) {
    console.error("Error fetching training years:", error);
    res.status(500).json({ error: "Failed to fetch training years" });
  }
});

// Get all quotes with optional filtering (with author and source details)
app.get("/api/quotes", async (req, res) => {
  try {
    const {
      quote,
      author,
      source,
      tags,
      score,
      date,
      types,
      note_type,
      training_types,
      translation_group,
      hasAuthor,
      hasSource,
      hasNote,
      hasTags,
      hasImage,
      hasImageType,
      hasTranslationGroup,
      hasMultipleAttachments,
      hasTitle,
      hasText,
      noteId,
      limit = 20,
      offset = 0,
    } = req.query;
    
    let query = `
      SELECT DISTINCT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramCounter = 1;

    // Text search with AND/OR operators — searches note_text and comment
    if (quote) {
      const { condition, newParamCounter } = buildTextSearchCondition(quote, ['q.note_text', 'q.note_title', 'q.comment'], paramCounter, params);
      query += condition;
      paramCounter = newParamCounter;
    }

    if (author) {
      query += ` AND a.name ILIKE $${paramCounter}`;
      params.push(`%${author}%`);
      paramCounter++;
    }

    if (source) {
      query += ` AND s.name ILIKE $${paramCounter}`;
      params.push(`%${source}%`);
      paramCounter++;
    }

    // Tag search with AND/OR operators
    if (tags) {
      const { condition, newParamCounter } = buildTagSearchCondition(tags, paramCounter, params);
      query += condition;
      paramCounter = newParamCounter;
    }

    if (date) {
      query += ` AND q.date = $${paramCounter}`;
      params.push(date);
      paramCounter++;
    }

    if (score) {
      // Enhanced score search syntax:
      // "5" = exact match (5)
      // "5+" = 5 and higher (5, 6)
      // "3-5" = range (3, 4, 5)
      
      if (score.includes('-')) {
        // Range: "3-5"
        const [min, max] = score.split('-').map(s => s.trim());
        if (min && max && !isNaN(min) && !isNaN(max)) {
          query += ` AND q.score >= $${paramCounter} AND q.score <= $${paramCounter + 1}`;
          params.push(min, max);
          paramCounter += 2;
        }
      } else if (score.endsWith('+')) {
        // Minimum: "5+"
        const min = score.replace('+', '').trim();
        if (min && !isNaN(min)) {
          query += ` AND q.score >= $${paramCounter}`;
          params.push(min);
          paramCounter++;
        }
      } else {
        // Exact match: "5"
        query += ` AND q.score = $${paramCounter}`;
        params.push(score.trim());
        paramCounter++;
      }
    }
    
    // Filter by quote source types
    if (types) {
      const typeArray = types.split(",").filter((t) => t);
      const totalTypes = 6; // BOOK, MOVIE-TV, POETRY, LYRICS, JOKES, ASSORTED
      if (typeArray.length > 0 && typeArray.length < totalTypes) {
        if (note_type === 'quote') {
          // Quote view: filter all notes by type
          query += ` AND q.type = ANY($${paramCounter})`;
        } else {
          // All Notes view: only restrict quote-type notes; other note types pass through
          query += ` AND (q.note_type != 'quote' OR q.type = ANY($${paramCounter}))`;
        }
        params.push(typeArray);
        paramCounter++;
      }
    }

    // Find by ID
    if (noteId && !isNaN(parseInt(noteId))) {
      query += ` AND q.id = $${paramCounter}`;
      params.push(parseInt(noteId));
      paramCounter++;
    }

    // Metadata filters
    if (hasAuthor === 'true') {
      query += ` AND q.author_id IS NOT NULL`;
    } else if (hasAuthor === 'false') {
      query += ` AND q.author_id IS NULL`;
    }

    if (hasSource === 'true') {
      query += ` AND q.source_id IS NOT NULL`;
    } else if (hasSource === 'false') {
      query += ` AND q.source_id IS NULL`;
    }

    if (hasNote === 'true') {
      query += ` AND q.comment IS NOT NULL AND q.comment != ''`;
    } else if (hasNote === 'false') {
      query += ` AND (q.comment IS NULL OR q.comment = '')`;
    }

    if (hasTags === 'true') {
      query += ` AND EXISTS (SELECT 1 FROM note_tags WHERE note_id = q.id)`;
    } else if (hasTags === 'false') {
      query += ` AND NOT EXISTS (SELECT 1 FROM note_tags WHERE note_id = q.id)`;
    }

    if (hasImage === 'true') {
      query += ` AND q.attachment_full IS NOT NULL AND q.attachment_full != ''`;
    } else if (hasImage === 'false') {
      query += ` AND (q.attachment_full IS NULL OR q.attachment_full = '')`;
    }

    if (hasImageType === 'true') {
      query += ` AND q.attachment_full IS NOT NULL AND q.attachment_full != '' AND q.attachment_type = 'image'`;
    } else if (hasImageType === 'false') {
      query += ` AND q.attachment_full IS NOT NULL AND q.attachment_full != '' AND (q.attachment_type IS NULL OR q.attachment_type != 'image')`;
    }

    if (hasTranslationGroup === 'true') {
      query += ` AND q.translation_group IS NOT NULL AND q.translation_group != ''`;
    } else if (hasTranslationGroup === 'false') {
      query += ` AND (q.translation_group IS NULL OR q.translation_group = '')`;
    }

    if (hasMultipleAttachments === 'true') {
      query += ` AND (SELECT COUNT(*) FROM note_attachments WHERE note_id = q.id) > 1`;
    } else if (hasMultipleAttachments === 'false') {
      query += ` AND (SELECT COUNT(*) FROM note_attachments WHERE note_id = q.id) <= 1`;
    }

    if (hasTitle === 'true') {
      query += ` AND q.note_title IS NOT NULL AND q.note_title != '' AND q.note_title != 'No title'`;
    } else if (hasTitle === 'false') {
      query += ` AND (q.note_title IS NULL OR q.note_title = '' OR q.note_title = 'No title')`;
    }

    if (hasText === 'true') {
      query += ` AND q.note_text IS NOT NULL AND q.note_text != ''`;
    } else if (hasText === 'false') {
      query += ` AND (q.note_text IS NULL OR q.note_text = '')`;
    }

    if (req.query.hideEncryptedNotes === 'true') {
      query += ` AND q.attachment_type IS DISTINCT FROM 'encrypted'`
             + ` AND NOT EXISTS (SELECT 1 FROM note_attachments WHERE note_id = q.id AND attachment_type = 'encrypted')`;
    }

    if (req.query.hideTag) {
      query += ` AND NOT EXISTS (
        SELECT 1 FROM note_tags nt
        JOIN tags t ON nt.tag_id = t.id
        WHERE nt.note_id = q.id AND LOWER(t.name) = LOWER($${paramCounter})
      )`;
      params.push(req.query.hideTag);
      paramCounter++;
    }

    // Translation group filter
    if (translation_group) {
      query += ` AND q.translation_group = $${paramCounter}`;
      params.push(translation_group);
      paramCounter++;
    }
    
    // Note type filter (also applies mode restriction when no specific type is requested)
    if (note_type) {
      query += ` AND q.note_type = $${paramCounter}`;
      params.push(note_type);
      paramCounter++;
    } else {
      query += ` AND q.note_type = ANY($${paramCounter})`;
      params.push(_allowedTypes);
      paramCounter++;
    }

    // Training types filter
    if (training_types) {
      const trainingTypeArray = training_types.split(",").filter((t) => t);
      if (trainingTypeArray.length > 0) {
        if (note_type === 'training') {
          // Training view: filter all notes by training sub-type
          query += ` AND q.type = ANY($${paramCounter})`;
        } else {
          // All Notes view: only restrict training-type notes; other note types pass through
          query += ` AND (q.note_type != 'training' OR q.type = ANY($${paramCounter}))`;
        }
        params.push(trainingTypeArray);
        paramCounter++;
      }
    }

    // Generic sub-type filter (for generic-behavior note types with configured sub-types)
    if (req.query.generic_sub_types) {
      const genericSubTypeArray = req.query.generic_sub_types.split(",").filter((t) => t);
      if (genericSubTypeArray.length > 0) {
        query += ` AND q.type = ANY($${paramCounter})`;
        params.push(genericSubTypeArray);
        paramCounter++;
      }
    }
    
    // Year filter for training notes - filter by year TAG instead of date
    if (req.query.year) {
      query += ` AND EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name = $${paramCounter}
      )`;
      params.push(req.query.year.toString());
      paramCounter++;
    }
    
    // Month filter for training notes - filter by month TAG instead of date
    if (req.query.month) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = monthNames[parseInt(req.query.month) - 1];
      
      query += ` AND EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name = $${paramCounter}
      )`;
      params.push(monthName);
      paramCounter++;
    }

    // dateFrom / dateTo — direct filtering on the note_date column (inclusive
    // on both ends).  Used by the Training Calendar, which needs to catch old
    // trainings that never got year/month tags.  Accepts 'YYYY-MM-DD' strings.
    if (req.query.dateFrom) {
      query += ` AND q.note_date >= $${paramCounter}`;
      params.push(req.query.dateFrom);
      paramCounter++;
    }
    if (req.query.dateTo) {
      query += ` AND q.note_date <= $${paramCounter}`;
      params.push(req.query.dateTo);
      paramCounter++;
    }

    // Sort by note_date for training notes (hierarchical by year/month tags, then date), otherwise by updated_at
    if (note_type === 'training') {
      // Hierarchical sorting for training notes using LEFT JOIN to get tags
      query = `
        WITH tagged_quotes AS (
          ${query}
        ),
        year_tags AS (
          SELECT qt.note_id, t.name as year_tag
          FROM note_tags qt
          JOIN tags t ON qt.tag_id = t.id
          WHERE t.name ~ '^[0-9]{4}$'
        ),
        month_tags AS (
          SELECT qt.note_id, t.name as month_tag,
            CASE t.name
              WHEN 'January' THEN 1
              WHEN 'February' THEN 2
              WHEN 'March' THEN 3
              WHEN 'April' THEN 4
              WHEN 'May' THEN 5
              WHEN 'June' THEN 6
              WHEN 'July' THEN 7
              WHEN 'August' THEN 8
              WHEN 'September' THEN 9
              WHEN 'October' THEN 10
              WHEN 'November' THEN 11
              WHEN 'December' THEN 12
            END as month_order
          FROM note_tags qt
          JOIN tags t ON qt.tag_id = t.id
          WHERE t.name IN ('January','February','March','April','May','June','July','August','September','October','November','December')
        )
        SELECT tq.*
        FROM tagged_quotes tq
        LEFT JOIN year_tags yt ON tq.id = yt.note_id
        LEFT JOIN month_tags mt ON tq.id = mt.note_id
        ORDER BY 
          yt.year_tag DESC NULLS LAST,
          CASE WHEN mt.month_tag IS NULL THEN 0 ELSE 1 END,
          mt.month_order DESC,
          CASE WHEN tq.note_date IS NULL THEN 0 ELSE 1 END,
          EXTRACT(DAY FROM tq.note_date) DESC,
          tq.updated_at DESC
        LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
      `;
    } else {
      query += ` ORDER BY q.updated_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    }
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    
    // Add tags and attachments to each note
    if (result.rows.length > 0) {
      const noteIds = result.rows.map(q => q.id);
      const attachmentsMap = await getAttachmentsForNotes(noteIds);

      const hasNewTables = await checkTagTablesExist();
      if (hasNewTables) {
        const tagsMap = await getTagsForNotes(noteIds);
        const quotesWithTags = result.rows.map(note => {
          const quoteTags = tagsMap.get(note.id) || [];
          const noteWithImages = retrieveQuoteImages(note);
          const noteWithAll = applyAttachments(noteWithImages, attachmentsMap.get(note.id));
          return {
            ...noteWithAll,
            tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : (note.tags || ""),
            tag_objects: quoteTags,
          };
        });
        res.json(quotesWithTags);
      } else {
        const quotesWithImages = result.rows.map(note =>
          applyAttachments(retrieveQuoteImages(note), attachmentsMap.get(note.id))
        );
        res.json(quotesWithImages);
      }
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error("Error fetching quotes:", error);
    res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

/**
 * Duplicate suspects for Options → Dedup: notes sharing the same fingerprint as
 * sync-db-notes (includes note_title). Skips empty / markup-only bodies.
 */
app.get("/api/dedup/suspects", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const gRes = await pool.query(
      `
      WITH annotated AS (
        SELECT
          n.id,
          md5(concat_ws(E'\\x1e',
            COALESCE(n.note_type, ''),
            COALESCE(n.type, ''),
            COALESCE(n.note_date::text, ''),
            COALESCE(n.note_text, ''),
            COALESCE(n.comment, ''),
            COALESCE(n.note_title, ''),
            COALESCE(n.translation_group, ''),
            COALESCE(a.name, ''),
            COALESCE(s.name, '')
          )) AS dup_key
        FROM notes n
        LEFT JOIN authors a ON a.id = n.author_id
        LEFT JOIN sources s ON s.id = n.source_id
        WHERE char_length(
          trim(regexp_replace(COALESCE(n.note_text, ''), '<[^>]+>', '', 'gi'))
        ) > 0
      ),
      grouped AS (
        SELECT dup_key,
               array_agg(id ORDER BY id) AS ids,
               COUNT(*)::int AS cnt
        FROM annotated
        GROUP BY dup_key
        HAVING COUNT(*) > 1
      )
      SELECT dup_key, ids, cnt FROM grouped
      ORDER BY cnt DESC, ids[1] ASC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    );

    if (gRes.rows.length === 0) {
      return res.json({ groups: [], limit, offset });
    }

    const allIds = [...new Set(gRes.rows.flatMap((g) => g.ids))];
    const notesResult = await pool.query(
      `
      SELECT q.*,
             a.name AS author_name, a.image AS author_image,
             s.name AS source_name, s.image AS source_image, q.type AS source_type
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = ANY($1::int[])
    `,
      [allIds],
    );

    const idToRow = new Map(notesResult.rows.map((r) => [r.id, r]));
    const attachmentsMap = await getAttachmentsForNotes(allIds);
    const hasNewTables = await checkTagTablesExist();
    let tagsMap = new Map();
    if (hasNewTables) {
      tagsMap = await getTagsForNotes(allIds);
    }

    const assemble = (note) => {
      const quoteTags = hasNewTables ? tagsMap.get(note.id) || [] : [];
      const withImages = retrieveQuoteImages(note);
      const withAll = applyAttachments(withImages, attachmentsMap.get(note.id));
      if (hasNewTables) {
        return {
          ...withAll,
          tags:
            quoteTags.length > 0
              ? quoteTags.map((t) => t.name).join(", ")
              : note.tags || "",
          tag_objects: quoteTags,
        };
      }
      return withAll;
    };

    const groups = gRes.rows.map((g) => ({
      dup_key: g.dup_key,
      ids: g.ids,
      count: g.cnt,
      notes: g.ids.map((id) => assemble(idToRow.get(id))).filter(Boolean),
    }));

    res.json({ groups, limit, offset });
  } catch (error) {
    console.error("Error fetching dedup suspects:", error);
    res.status(500).json({ error: "Failed to fetch duplicate suspects" });
  }
});

// Get random note (must be before /:id route). Default note_type=quote for backward compatibility.
app.get("/api/quotes/random", async (req, res) => {
  try {
    const raw = req.query.note_type;
    const noteType =
      typeof raw === "string" && raw.trim() !== "" ? raw.trim() : "quote";

    const result = await pool.query(
      `
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.note_type = $1
      ORDER BY RANDOM()
      LIMIT 1
    `,
      [noteType],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: `No notes of type "${noteType}"` });
    }

    // Add tags and attachments to response
    const noteId0 = result.rows[0].id;
    const attachmentsMap0 = await getAttachmentsForNotes([noteId0]);
    const hasNewTables = await checkTagTablesExist();
    if (hasNewTables) {
      const quoteTags = await getTagsForNote(noteId0);
      const quoteWithImages = retrieveQuoteImages(result.rows[0]);
      const quoteWithAll = applyAttachments(quoteWithImages, attachmentsMap0.get(noteId0));
      res.json({
        ...quoteWithAll,
        tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : (result.rows[0].tags || ""),
        tag_objects: quoteTags,
      });
    } else {
      res.json(applyAttachments(retrieveQuoteImages(result.rows[0]), attachmentsMap0.get(noteId0)));
    }
  } catch (error) {
    console.error("Error fetching random quote:", error);
    res.status(500).json({ error: "Failed to fetch random quote" });
  }
});

// Get single quote by ID
app.get("/api/quotes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT q.*, 
             a.name as author_name, a.image as author_image,
             s.name as source_name, s.image as source_image, q.type as source_type
      FROM notes q
      LEFT JOIN authors a ON q.author_id = a.id
      LEFT JOIN sources s ON q.source_id = s.id
      WHERE q.id = $1
    `,
      [id],
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quote not found" });
    }

    const attachmentsMap = await getAttachmentsForNotes([parseInt(id)]);
    const hasNewTables = await checkTagTablesExist();
    if (hasNewTables) {
      const quoteTags = await getTagsForNote(id);
      const quoteWithImages = retrieveQuoteImages(result.rows[0]);
      const quoteWithAll = applyAttachments(quoteWithImages, attachmentsMap.get(parseInt(id)));
      res.json({
        ...quoteWithAll,
        tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : (result.rows[0].tags || ""),
        tag_objects: quoteTags,
      });
    } else {
      res.json(applyAttachments(retrieveQuoteImages(result.rows[0]), attachmentsMap.get(parseInt(id))));
    }
  } catch (error) {
    console.error("Error fetching quote:", error);
    res.status(500).json({ error: "Failed to fetch quote" });
  }
});

// Create new quote
app.post("/api/quotes", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    const {
      note_text,
      note_title = null,
      author,
      source,
      sourceType = "BOOK",
      tags = "",
      thumbnail = "",
      attachment_full = "",
      attachment_type = "thumbnail",
      comment = "",
      score = null,
      note_type = "quote",
      note_date = null,
      translation_group = null,
      storageThresholdMB = 1, // From frontend settings
    } = req.body;
    
    if (!note_text && !note_title && !attachment_full && !thumbnail) {
      return res.status(400).json({ error: "Please provide at least some text, a title, or an attachment." });
    }

    let authorId = null;
    let sourceId = null;

    // Create or get author if provided
    if (author && author.trim()) {
      const authorResult = await client.query(
        `INSERT INTO authors (name) 
         VALUES ($1) 
         ON CONFLICT (name) DO UPDATE SET name = authors.name
         RETURNING id`,
        [author.trim()],
      );
      authorId = authorResult.rows[0].id;
    }

    // Create or get source if provided
    if (source && source.trim()) {
      const sourceResult = await client.query(
        `INSERT INTO sources (name, type) 
         VALUES ($1, $2) 
         ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type
         RETURNING id`,
        [source.trim(), sourceType],
      );
      sourceId = sourceResult.rows[0].id;
    }

    // Create the quote - still store tags column for backward compatibility
    // Insert the quote first to get ID
    const result = await client.query(
      `INSERT INTO notes (note_text, note_title, author_id, source_id, comment, type, score, note_type, note_date, translation_group) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [sanitizeNoteText(note_text), note_title || null, authorId, sourceId, comment, sourceType, score, note_type, note_date, translation_group],
    );

    const quoteId = result.rows[0].id;

    // Process attachments with hybrid storage using user's threshold
    const storageFolder = note_type || 'quote';
    // Rename any directly-uploaded tmp_ files to use the real note ID
    const renamedThumb = fileStorage.finalizeUploadedFile(thumbnail, quoteId, '');
    const renamedFull  = fileStorage.finalizeUploadedFile(attachment_full, quoteId, '');
    const processedImage     = fileStorage.processForStorage(renamedThumb, storageFolder, quoteId, '', storageThresholdMB, false);
    const processedImageFull = fileStorage.processForStorage(renamedFull,  storageFolder, quoteId, '', storageThresholdMB, true);


    // Update notes flat columns (backward compat) and write to note_attachments
    await client.query(
      `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
      [processedImage, processedImageFull, attachment_type, quoteId]
    );

    if (processedImage || processedImageFull) {
      await client.query(
        `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type)
         VALUES ($1, 0, $2, $3, $4, 'base64')
         ON CONFLICT DO NOTHING`,
        [quoteId, processedImage, processedImageFull, attachment_type || 'image']
      );
    }

    // Handle tags using new tag system (if tables exist)
    const tagNames = parseTagInput(tags);
    if (tagNames.length > 0) {
      const tagIds = await getOrCreateTagIds(tagNames, note_type, client);
      if (tagIds.length > 0) {
        await associateTagsWithNote(quoteId, tagIds, client);
      }
    }

    await client.query("COMMIT");

    // Fetch the complete quote with author, source, tags and attachments
    const completeQuote = await pool.query(
      `SELECT q.*, a.name as author_name, a.image as author_image,
              s.name as source_name, s.image as source_image, q.type as source_type
       FROM notes q
       LEFT JOIN authors a ON q.author_id = a.id
       LEFT JOIN sources s ON q.source_id = s.id
       WHERE q.id = $1`,
      [quoteId],
    );

    const quoteTags = await getTagsForNote(quoteId);
    const attachmentsMap = await getAttachmentsForNotes([quoteId]);
    const quoteWithImages = retrieveQuoteImages(completeQuote.rows[0]);
    const quoteWithAll = applyAttachments(quoteWithImages, attachmentsMap.get(quoteId));
    res.status(201).json({
      ...quoteWithAll,
      tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : "",
      tag_objects: quoteTags,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating quote:", error);
    res.status(500).json({ error: "Failed to create quote" });
  } finally {
    client.release();
  }
});

// Update quote
app.put("/api/quotes/:id", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    const { id } = req.params;
    const {
      note_text,
      note_title,
      author,
      source,
      sourceType,
      sourceId,
      tags,
      thumbnail,
      attachment_full,
      attachment_type,
      comment,
      score,
      note_type,
      note_date,
      translation_group,
      storageThresholdMB = 1, // From frontend settings
    } = req.body;


    let authorId = null;
    let newSourceId = null;

    // Handle author update
    if (author !== undefined) {
      if (author && author.trim()) {
        const authorResult = await client.query(
          `INSERT INTO authors (name) 
           VALUES ($1) 
           ON CONFLICT (name) DO UPDATE SET name = authors.name
           RETURNING id`,
          [author.trim()],
        );
        authorId = authorResult.rows[0].id;
      }
    }

    // Handle source update - simpler now since type is stored in quotes table
    if (source !== undefined) {
      if (source && source.trim()) {
        // Create or get source by name
        const sourceResult = await client.query(
          `INSERT INTO sources (name, type) 
           VALUES ($1, $2) 
           ON CONFLICT (name) DO UPDATE SET name = sources.name
           RETURNING id`,
          [source.trim(), sourceType || "BOOK"],
        );
        newSourceId = sourceResult.rows[0].id;
      }
    }

    // Fetch existing attachment values so we can delete old files if they are cleared
    const existingRow = await client.query(
      `SELECT thumbnail, attachment_full FROM notes WHERE id = $1`, [id]
    );
    const existingThumb = existingRow.rows[0]?.thumbnail || null;
    const existingFull  = existingRow.rows[0]?.attachment_full || null;

    // Update the quote
    const updateFields = [];
    const params = [];
    let paramCounter = 1;

    if (note_text !== undefined) {
      updateFields.push(`note_text = $${paramCounter}`);
      params.push(sanitizeNoteText(note_text));
      paramCounter++;
    }

    if (note_title !== undefined) {
      updateFields.push(`note_title = $${paramCounter}`);
      params.push(note_title || null);
      paramCounter++;
    }

    if (author !== undefined) {
      updateFields.push(`author_id = $${paramCounter}`);
      params.push(authorId);
      paramCounter++;
    }

    if (source !== undefined) {
      updateFields.push(`source_id = $${paramCounter}`);
      params.push(newSourceId);
      paramCounter++;
    }

    // Handle tags
    let tagsToUpdate = null;
    if (tags !== undefined) {
      tagsToUpdate = tags;
    }

    // Process thumbnails through hybrid storage if provided
    const updateStorageFolder = note_type || 'quote';
    // These hold the final processed values so the note_attachments sync below can reuse them
    let processedSyncThumb = undefined;
    let processedSyncFull  = undefined;

    if (thumbnail !== undefined && thumbnail) {
      const renamedThumb   = fileStorage.finalizeUploadedFile(thumbnail, id, '');
      processedSyncThumb   = fileStorage.processForStorage(renamedThumb, updateStorageFolder, id, '', storageThresholdMB, false);
      updateFields.push(`thumbnail = $${paramCounter}`);
      params.push(processedSyncThumb);
      paramCounter++;
    } else if (thumbnail !== undefined) {
      processedSyncThumb = null;
      updateFields.push(`thumbnail = $${paramCounter}`);
      params.push(thumbnail);
      paramCounter++;
    }

    if (attachment_full !== undefined && attachment_full) {
      const renamedFull = fileStorage.finalizeUploadedFile(attachment_full, id, '');
      processedSyncFull = fileStorage.processForStorage(renamedFull, updateStorageFolder, id, '', storageThresholdMB, true);
      updateFields.push(`attachment_full = $${paramCounter}`);
      params.push(processedSyncFull);
      paramCounter++;
    } else if (attachment_full !== undefined) {
      processedSyncFull = null;
      updateFields.push(`attachment_full = $${paramCounter}`);
      params.push(attachment_full);
      paramCounter++;
    }

    if (comment !== undefined) {
      updateFields.push(`comment = $${paramCounter}`);
      params.push(comment);
      paramCounter++;
    }

    if (score !== undefined) {
      updateFields.push(`score = $${paramCounter}`);
      params.push(score);
      paramCounter++;
    }
    
    if (sourceType !== undefined) {
      updateFields.push(`type = $${paramCounter}`);
      params.push(sourceType);
      paramCounter++;
    }
    
    if (attachment_type !== undefined) {
      updateFields.push(`attachment_type = $${paramCounter}`);
      params.push(attachment_type);
      paramCounter++;
    }
    
    if (note_type !== undefined) {
      updateFields.push(`note_type = $${paramCounter}`);
      params.push(note_type);
      paramCounter++;
    }
    
    if (note_date !== undefined) {
      updateFields.push(`note_date = $${paramCounter}`);
      params.push(note_date);
      paramCounter++;
    }
    
    // Handle translation_group with rename propagation
    let oldTranslationGroup = null;
    if (translation_group !== undefined) {
      // First, get the current translation_group value
      const currentQuote = await client.query(
        'SELECT translation_group FROM notes WHERE id = $1',
        [id]
      );
      
      if (currentQuote.rows.length > 0) {
        oldTranslationGroup = currentQuote.rows[0].translation_group;
        
        // If translation_group is changing (and old one exists), update all quotes in the old group
        if (oldTranslationGroup && oldTranslationGroup !== translation_group) {
          await client.query(
            `UPDATE notes 
             SET translation_group = $1 
             WHERE translation_group = $2`,
            [translation_group, oldTranslationGroup]
          );
        }
      }
      
      updateFields.push(`translation_group = $${paramCounter}`);
      params.push(translation_group);
      paramCounter++;
    }

    // Always update updated_at timestamp
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    params.push(id);
    const result = await client.query(
      `UPDATE notes SET ${updateFields.join(", ")} WHERE id = $${paramCounter} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Delete old files from disk if the attachment fields were explicitly cleared
    if (thumbnail !== undefined && !thumbnail && existingThumb) {
      fileStorage.deleteAttachment(existingThumb);
    }
    if (attachment_full !== undefined && !attachment_full && existingFull) {
      fileStorage.deleteAttachment(existingFull);
    }

    // Handle tags update if provided (only if new tables exist)
    if (tagsToUpdate !== null) {
      const tagNames = parseTagInput(tagsToUpdate);
      const tagIds = await getOrCreateTagIds(tagNames, note_type, client);
      
      if (tagIds.length > 0) {
        await associateTagsWithNote(id, tagIds, client);
      } else {
        const hasNewTables = await checkTagTablesExist();
        if (hasNewTables) {
          await client.query("DELETE FROM note_tags WHERE note_id = $1", [id]);
        }
      }
    }

    // Sync note_attachments position=0 with updated flat attachment fields
    if (thumbnail !== undefined || attachment_full !== undefined || attachment_type !== undefined) {
      // Use the already-finalized+processed values computed above — NOT the raw request values
      // (which would still contain tmp_ filenames before finalizeUploadedFile ran)
      const syncThumb = processedSyncThumb;
      const syncFull  = processedSyncFull;

      const existing = await client.query(
        `SELECT id FROM note_attachments WHERE note_id = $1 AND position = 0`, [id]
      );
      if (existing.rows.length > 0) {
        const setParts = [];
        const setVals  = [];
        if (syncThumb  !== undefined) { setParts.push(`thumbnail = $${setVals.length+1}`);       setVals.push(syncThumb  || null); }
        if (syncFull   !== undefined) { setParts.push(`attachment_full = $${setVals.length+1}`); setVals.push(syncFull   || null); }
        if (attachment_type !== undefined) { setParts.push(`attachment_type = $${setVals.length+1}`); setVals.push(attachment_type || null); }
        if (setParts.length > 0) {
          setVals.push(id);
          await client.query(
            `UPDATE note_attachments SET ${setParts.join(', ')} WHERE note_id = $${setVals.length} AND position = 0`,
            setVals
          );
        }
      } else if (syncThumb || syncFull) {
        await client.query(
          `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type)
           VALUES ($1, 0, $2, $3, $4, 'base64')`,
          [id, syncThumb || null, syncFull || null, attachment_type || 'image']
        );
      }
    }

    await client.query("COMMIT");

    // Fetch the complete updated note with author, source, tags and attachments
    const completeQuote = await pool.query(
      `SELECT q.*, a.name as author_name, a.image as author_image,
              s.name as source_name, s.image as source_image, q.type as source_type
       FROM notes q
       LEFT JOIN authors a ON q.author_id = a.id
       LEFT JOIN sources s ON q.source_id = s.id
       WHERE q.id = $1`,
      [id],
    );

    const hasNewTables = await checkTagTablesExist();
    const quoteTags = hasNewTables ? await getTagsForNote(id) : [];
    const attachmentsMapPut = await getAttachmentsForNotes([parseInt(id)]);
    const quoteWithImages = retrieveQuoteImages(completeQuote.rows[0]);
    const quoteWithAll = applyAttachments(quoteWithImages, attachmentsMapPut.get(parseInt(id)));
    res.json({
      ...quoteWithAll,
      tags: quoteTags.length > 0 ? quoteTags.map((t) => t.name).join(", ") : (completeQuote.rows[0].tags || ""),
      tag_objects: quoteTags,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating quote:", error);
    res.status(500).json({ error: "Failed to update quote" });
  } finally {
    client.release();
  }
});

// Downscale and move thumbnail from external storage to DB
app.post("/api/quotes/:id/downscale-thumbnail", async (req, res) => {
  try {
    const { id } = req.params;
    const { thumbnail, attachment_full, oldFilePath } = req.body;


    // Overwrite the existing file on disk with the downscaled version.
    // The file: reference in the DB stays unchanged — same path, smaller file.
    if (oldFilePath) {
      const { data } = fileStorage.parseBase64Data(attachment_full);
      const buffer   = Buffer.from(data, 'base64');
      const fullPath = path.join(fileStorage.getAttachmentsDir(), oldFilePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, buffer);
    }

    // Only the thumbnail changes in the DB (attachment_full file: ref stays the same)
    await pool.query(
      `UPDATE notes SET thumbnail = $1 WHERE id = $2`,
      [thumbnail, id]
    );

    await pool.query(
      `UPDATE note_attachments SET thumbnail = $1
         WHERE note_id = $2 AND (attachment_full LIKE $3 OR thumbnail LIKE $3)`,
      [thumbnail, id, `file:${oldFilePath}%`]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error downscaling thumbnail:", error);
    res.status(500).json({ error: "Failed to downscale thumbnail" });
  }
});

// ── Note Attachments CRUD ──────────────────────────────────────────────────

// GET  /api/notes/:id/attachments  — list all attachments for a note
app.get("/api/notes/:id/attachments", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
      [id]
    );
    res.json(result.rows.map(resolveAttachment));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notes/:id/attachments  — add an attachment to a note
app.post("/api/notes/:id/attachments", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { id } = req.params;
    const { thumbnail, attachment_full, attachment_type = 'image', filename, storageThresholdMB = 1 } = req.body;

    const posResult = await client.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM note_attachments WHERE note_id = $1`, [id]
    );
    const position = posResult.rows[0].next_pos;

    const noteRow = await client.query(`SELECT note_type FROM notes WHERE id = $1`, [id]);
    const folder  = noteRow.rows[0]?.note_type || 'historical';

    const renamedThumb   = fileStorage.finalizeUploadedFile(thumbnail, `${id}_a${position}`, '');
    const renamedFull    = fileStorage.finalizeUploadedFile(attachment_full, `${id}_a${position}`, '');
    const processedThumb = fileStorage.processForStorage(renamedThumb, folder, `${id}_a${position}`, '', storageThresholdMB, false);
    const processedFull  = fileStorage.processForStorage(renamedFull,  folder, `${id}_a${position}`, '', storageThresholdMB, true);

    const ins = await client.query(
      `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
       VALUES ($1, $2, $3, $4, $5, 'base64', $6) RETURNING *`,
      [id, position, processedThumb, processedFull, attachment_type, filename || null]
    );

    // Keep notes flat columns in sync with position=0
    if (position === 0) {
      await client.query(
        `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
        [processedThumb, processedFull, attachment_type, id]
      );
    }

    await client.query("COMMIT");
    res.status(201).json(resolveAttachment(ins.rows[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/notes/:noteId/attachments/:attachId  — remove one attachment
app.delete("/api/notes/:noteId/attachments/:attachId", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { noteId, attachId } = req.params;

    const attRow = await client.query(
      `SELECT * FROM note_attachments WHERE id = $1 AND note_id = $2`, [attachId, noteId]
    );
    if (attRow.rows.length === 0) return res.status(404).json({ error: "Attachment not found" });

    const att = attRow.rows[0];
    // Delete filesystem files if applicable
    if (att.thumbnail)       fileStorage.deleteAttachment(att.thumbnail);
    if (att.attachment_full) fileStorage.deleteAttachment(att.attachment_full);

    await client.query(`DELETE FROM note_attachments WHERE id = $1`, [attachId]);

    // Re-number positions
    await client.query(
      `UPDATE note_attachments SET position = pos_rank - 1
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS pos_rank
             FROM note_attachments WHERE note_id = $1) ranked
       WHERE note_attachments.id = ranked.id`,
      [noteId]
    );

    // Sync notes flat columns with new position=0 (or null if no attachments left)
    const newFirst = await client.query(
      `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position LIMIT 1`, [noteId]
    );
    if (newFirst.rows.length > 0) {
      const f = newFirst.rows[0];
      await client.query(
        `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
        [f.thumbnail, f.attachment_full, f.attachment_type, noteId]
      );
    } else {
      await client.query(
        `UPDATE notes SET thumbnail = NULL, attachment_full = NULL, attachment_type = NULL WHERE id = $1`,
        [noteId]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/notes/:id/attachments/file
// Accepts multipart/form-data: field "file" (the .enc blob) + fields
//   attachment_type, original_name, folder.
// Stores the file on disk and inserts a note_attachments row.
app.post("/api/notes/:id/attachments/file", upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    const noteId = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const folder       = req.body.folder || 'note';
    const origName     = req.body.original_name || req.file.originalname;
    const attachType   = req.body.attachment_type || 'encrypted';

    // Move tmp file to a stable name: <noteId>.<origName>.enc
    const tmpPath  = req.file.path;
    const stableFilename = `${noteId}.${origName}.enc`;
    const stableDir  = path.join(fileStorage.getAttachmentsDir(), folder);
    if (!fs.existsSync(stableDir)) fs.mkdirSync(stableDir, { recursive: true });
    const stablePath = path.join(stableDir, stableFilename);
    fs.renameSync(tmpPath, stablePath);

    const relPath  = `${folder}/${stableFilename}`;
    const fileRef  = `file:${relPath}`;

    // Find next position
    const posRes = await client.query(
      `SELECT COALESCE(MAX(position) + 1, 0) AS pos FROM note_attachments WHERE note_id = $1`,
      [noteId]
    );
    const position = posRes.rows[0].pos;

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO note_attachments (note_id, thumbnail, attachment_full, attachment_type, position)
       VALUES ($1, $2, $3, $4, $5)`,
      [noteId, null, fileRef, attachType, position]
    );

    // If it's the primary attachment (position 0) sync flat columns
    if (position === 0) {
      await client.query(
        `UPDATE notes SET thumbnail = NULL, attachment_full = $1, attachment_type = $2 WHERE id = $3`,
        [fileRef, attachType, noteId]
      );
    }
    await client.query("COMMIT");

    res.json({ ok: true, fileRef, relPath });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error('Encrypted upload error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/notes/:noteId/attachments/:attachId/make-primary
// Moves the given attachment to position=0 (re-numbers the rest) and syncs flat columns.
app.patch("/api/notes/:noteId/attachments/:attachId/make-primary", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { noteId, attachId } = req.params;

    const allRows = await client.query(
      `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
      [noteId]
    );
    if (allRows.rows.length === 0) return res.status(404).json({ error: "No attachments" });

    const targetIdx = allRows.rows.findIndex(r => r.id === parseInt(attachId));
    if (targetIdx < 0) return res.status(404).json({ error: "Attachment not found" });
    if (targetIdx === 0) { await client.query("ROLLBACK"); return res.json({ ok: true }); }

    // Re-order: move target to front, shift others down
    const reordered = [
      allRows.rows[targetIdx],
      ...allRows.rows.slice(0, targetIdx),
      ...allRows.rows.slice(targetIdx + 1),
    ];
    for (let i = 0; i < reordered.length; i++) {
      await client.query(
        `UPDATE note_attachments SET position = $1 WHERE id = $2`,
        [i, reordered[i].id]
      );
    }

    // Sync flat columns on notes with new position=0
    const first = reordered[0];
    await client.query(
      `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
      [first.thumbnail, first.attachment_full, first.attachment_type, noteId]
    );

    await client.query("COMMIT");

    // Return updated list
    const updated = await pool.query(
      `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`, [noteId]
    );
    res.json(updated.rows.map(resolveAttachment));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── Note Merge ───────────────────────────────────────────────────────────────

// POST /api/notes/merge
// Body: { mainNoteId, otherNoteIds[], appendTexts, mergeTags }
// Moves all attachments + optionally text/tags from otherNoteIds into mainNoteId,
// then deletes the other notes.
app.post("/api/notes/merge", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { mainNoteId, otherNoteIds = [], appendTexts = true, mergeTags = true } = req.body;
    if (!mainNoteId || otherNoteIds.length === 0) {
      return res.status(400).json({ error: "mainNoteId and otherNoteIds required" });
    }

    // Verify main note exists
    const mainRow = await client.query(
      `SELECT * FROM notes WHERE id = $1`, [mainNoteId]
    );
    if (mainRow.rows.length === 0) return res.status(404).json({ error: "Main note not found" });

    // For each "other" note, move its attachments to main
    let nextPos = (await client.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM note_attachments WHERE note_id = $1`,
      [mainNoteId]
    )).rows[0].n;

    for (const otherId of otherNoteIds) {
      // Re-assign each attachment row to mainNoteId with new positions
      const otherAtts = await client.query(
        `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`, [otherId]
      );
      for (const att of otherAtts.rows) {
        await client.query(
          `UPDATE note_attachments SET note_id = $1, position = $2 WHERE id = $3`,
          [mainNoteId, nextPos++, att.id]
        );
      }
    }

    // Optionally append texts from other notes (wrapped in a divider)
    if (appendTexts) {
      const others = await client.query(
        `SELECT id, note_text, comment FROM notes WHERE id = ANY($1::int[]) ORDER BY id`,
        [otherNoteIds]
      );
      const dividerParts = others.rows
        .filter(r => r.note_text && r.note_text.trim() !== '')
        .map(r => {
          const label = r.comment ? `<em>${r.comment}</em>` : '';
          return `<hr>${label}${r.note_text}`;
        });
      if (dividerParts.length > 0) {
        const appendedText = (mainRow.rows[0].note_text || '') + dividerParts.join('');
        await client.query(
          `UPDATE notes SET note_text = $1 WHERE id = $2`, [appendedText, mainNoteId]
        );
      }
    }

    // Optionally merge tags from other notes
    if (mergeTags) {
      const otherTagIds = await client.query(
        `SELECT DISTINCT tag_id FROM note_tags WHERE note_id = ANY($1::int[])`, [otherNoteIds]
      );
      for (const row of otherTagIds.rows) {
        await client.query(
          `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [mainNoteId, row.tag_id]
        );
      }
    }

    // Delete the other notes (cascades note_attachments — but we already moved them above,
    // so only the now-empty rows remain; they'll be deleted safely)
    await client.query(
      `DELETE FROM notes WHERE id = ANY($1::int[])`, [otherNoteIds]
    );

    // Clear translation_group on main note (no longer grouped)
    await client.query(
      `UPDATE notes SET translation_group = NULL WHERE id = $1`, [mainNoteId]
    );

    // Sync flat columns with new position=0 attachment
    const newFirst = await client.query(
      `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position LIMIT 1`, [mainNoteId]
    );
    if (newFirst.rows.length > 0) {
      const f = newFirst.rows[0];
      await client.query(
        `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
        [f.thumbnail, f.attachment_full, f.attachment_type, mainNoteId]
      );
    }

    await client.query("COMMIT");

    // Return the fully populated main note
    const result = await pool.query(
      `SELECT q.*, a.name as author_name, a.image as author_image,
              s.name as source_name, s.image as source_image, q.type as source_type
       FROM notes q
       LEFT JOIN authors a ON q.author_id = a.id
       LEFT JOIN sources s ON q.source_id = s.id
       WHERE q.id = $1`,
      [mainNoteId]
    );
    const quoteTags   = await getTagsForNote(mainNoteId);
    const attsMap     = await getAttachmentsForNotes([mainNoteId]);
    const withImages  = retrieveQuoteImages(result.rows[0]);
    const withAll     = applyAttachments(withImages, attsMap.get(mainNoteId));
    res.json({
      ...withAll,
      tags: quoteTags.map(t => t.name).join(", "),
      tag_objects: quoteTags,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Merge error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────

// Get translations for a quote (by translation_group)
app.get("/api/quotes/:id/translations", async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, get the translation_group of this quote
    const quoteResult = await pool.query(
      "SELECT translation_group, language FROM notes WHERE id = $1",
      [id]
    );
    
    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: "Quote not found" });
    }
    
    const { translation_group, language: currentLanguage } = quoteResult.rows[0];
    
    if (!translation_group) {
      // No translation group - return empty array
      return res.json([]);
    }
    
    // Get all quotes in the same translation group (except this one)
    const result = await pool.query(
      `SELECT q.id, q.note_text, q.language, q.type,
              a.name as author_name,
              s.name as source_name
       FROM notes q
       LEFT JOIN authors a ON q.author_id = a.id
       LEFT JOIN sources s ON q.source_id = s.id
       WHERE q.translation_group = $1 AND q.id != $2
       ORDER BY q.language`,
      [translation_group, id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching translations:", error);
    res.status(500).json({ error: "Failed to fetch translations" });
  }
});

// Delete quote
app.delete("/api/quotes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, fetch the note to get thumbnail references
    const noteResult = await pool.query("SELECT thumbnail, attachment_full FROM notes WHERE id = $1", [id]);
    
    if (noteResult.rows.length === 0) {
      return res.status(404).json({ error: "Quote not found" });
    }
    
    // Delete external files if they exist (no-op if base64)
    fileStorage.deleteAttachment(noteResult.rows[0].thumbnail);
    fileStorage.deleteAttachment(noteResult.rows[0].attachment_full);
    
    // Delete the quote from database
    const result = await pool.query(
      "DELETE FROM notes WHERE id = $1 RETURNING *",
      [id],
    );

    res.json({ message: "Quote deleted successfully", quote: result.rows[0] });
  } catch (error) {
    console.error("Error deleting quote:", error);
    res.status(500).json({ error: "Failed to delete quote" });
  }
});

// ============= BULK OPERATIONS API =============

/**
 * Return the list of note IDs that match a given filter set.
 * Used by the front-end "Select All filtered" flow when we need to
 * materialise the full ID list (e.g. to support excluding some notes
 * from an otherwise-all-filtered operation like Merge or PDF export).
 *
 * Body: { filters: { ... } }
 * Response: { ids: number[] }
 */
app.post("/api/quotes/ids", async (req, res) => {
  try {
    const { filters } = req.body || {};
    const { query, params } = buildFilterQuery(filters || {});
    const result = await pool.query(`SELECT q.id ${query}`, params);
    res.json({ ids: result.rows.map(r => r.id) });
  } catch (error) {
    console.error("Error fetching filtered note IDs:", error);
    res.status(500).json({ error: "Failed to fetch note IDs" });
  }
});

// Get count of filtered quotes (for bulk operations preview)
app.post("/api/quotes/bulk-count", async (req, res) => {
  try {
    const { filters, noteIds } = req.body;

    if (noteIds && Array.isArray(noteIds) && noteIds.length > 0) {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM quotes WHERE id = ANY($1::int[])`,
        [noteIds]
      );
      return res.json({ count: parseInt(result.rows[0].count) });
    }

    // Build filter query to get matching quote count
    const { query, params } = buildFilterQuery(filters);
    const fullQuery = `SELECT COUNT(*) as count ${query}`;
    
    const result = await pool.query(fullQuery, params);
    const count = parseInt(result.rows[0].count);
    
    res.json({ count });
  } catch (error) {
    console.error("Error counting filtered quotes:", error);
    res.status(500).json({ error: "Failed to count quotes" });
  }
});

// Helper function to build quote filter query (reuses logic from GET /api/quotes)
function buildFilterQuery(filters) {
  let query = `FROM notes q`;
  const params = [];
  let paramCounter = 1;
  
  // Note type filter (also applies mode restriction when no specific type is requested)
  if (filters.note_type) {
    query += ` WHERE q.note_type = $${paramCounter}`;
    params.push(filters.note_type);
    paramCounter++;
  } else {
    query += ` WHERE q.note_type = ANY($${paramCounter})`;
    params.push(_allowedTypes);
    paramCounter++;
  }
  
  // Author filter
  if (filters.author_id && filters.author_id !== 'all') {
    query += ` AND q.author_id = $${paramCounter}`;
    params.push(parseInt(filters.author_id));
    paramCounter++;
  }
  
  // Source filter
  if (filters.source_id && filters.source_id !== 'all') {
    query += ` AND q.source_id = $${paramCounter}`;
    params.push(parseInt(filters.source_id));
    paramCounter++;
  }
  
  // Search query
  if (filters.search) {
    query += ` AND (q.note_text ILIKE $${paramCounter} OR q.note_title ILIKE $${paramCounter} OR q.comment ILIKE $${paramCounter})`;
    params.push(`%${filters.search}%`);
    paramCounter++;
  }
  
  // Tag search (AND logic; prefix ! means NOT)
  if (filters.tag) {
    const searchTags = filters.tag.split(',').map(t => t.trim()).filter(t => t);
    searchTags.forEach((tag) => {
      const exclude = tag.startsWith('!');
      const tagName = exclude ? tag.slice(1).trim() : tag;
      if (!tagName) return;
      const existsClause = `EXISTS (
        SELECT 1 FROM note_tags qt 
        JOIN tags t ON qt.tag_id = t.id 
        WHERE qt.note_id = q.id AND t.name ILIKE $${paramCounter}
      )`;
      query += exclude ? ` AND NOT ${existsClause}` : ` AND ${existsClause}`;
      params.push(`%${tagName}%`);
      paramCounter++;
    });
  }
  
  // Quote types filter
  if (filters.types) {
    const typeArray = filters.types.split(",").filter((t) => t);
    const totalTypes = 6;
    if (typeArray.length > 0 && typeArray.length < totalTypes) {
      if (filters.note_type === 'quote') {
        query += ` AND q.type = ANY($${paramCounter})`;
      } else {
        query += ` AND (q.note_type != 'quote' OR q.type = ANY($${paramCounter}))`;
      }
      params.push(typeArray);
      paramCounter++;
    }
  }

  // Training types filter
  if (filters.training_types) {
    const trainingTypeArray = filters.training_types.split(",").filter((t) => t);
    if (trainingTypeArray.length > 0) {
      if (filters.note_type === 'training') {
        query += ` AND q.type = ANY($${paramCounter})`;
      } else {
        query += ` AND (q.note_type != 'training' OR q.type = ANY($${paramCounter}))`;
      }
      params.push(trainingTypeArray);
      paramCounter++;
    }
  }
  
  // Year filter
  if (filters.year) {
    query += ` AND EXTRACT(YEAR FROM q.note_date) = $${paramCounter}`;
    params.push(parseInt(filters.year));
    paramCounter++;
  }
  
  // Month filter
  if (filters.month && filters.year) {
    query += ` AND EXTRACT(MONTH FROM q.note_date) = $${paramCounter}`;
    params.push(parseInt(filters.month));
    paramCounter++;
  }
  
  // Score filter
  if (filters.score) {
    if (filters.score.includes('-')) {
      const [min, max] = filters.score.split('-').map(s => s.trim());
      if (min && max && !isNaN(min) && !isNaN(max)) {
        query += ` AND q.score >= $${paramCounter} AND q.score <= $${paramCounter + 1}`;
        params.push(min, max);
        paramCounter += 2;
      }
    } else if (filters.score.endsWith('+')) {
      const min = filters.score.replace('+', '').trim();
      if (min && !isNaN(min)) {
        query += ` AND q.score >= $${paramCounter}`;
        params.push(min);
        paramCounter++;
      }
    } else {
      query += ` AND q.score = $${paramCounter}`;
      params.push(filters.score.trim());
      paramCounter++;
    }
  }
  
  // Metadata filters
  if (filters.hasAuthor === 'true') {
    query += ` AND q.author_id IS NOT NULL`;
  } else if (filters.hasAuthor === 'false') {
    query += ` AND q.author_id IS NULL`;
  }
  
  if (filters.hasSource === 'true') {
    query += ` AND q.source_id IS NOT NULL`;
  } else if (filters.hasSource === 'false') {
    query += ` AND q.source_id IS NULL`;
  }
  
  if (filters.hasNote === 'true') {
    query += ` AND q.comment IS NOT NULL AND q.comment != ''`;
  } else if (filters.hasNote === 'false') {
    query += ` AND (q.comment IS NULL OR q.comment = '')`;
  }
  
  if (filters.hasTags === 'true') {
    query += ` AND EXISTS (SELECT 1 FROM note_tags WHERE note_id = q.id)`;
  } else if (filters.hasTags === 'false') {
    query += ` AND NOT EXISTS (SELECT 1 FROM note_tags WHERE note_id = q.id)`;
  }

  if (filters.hasImage === 'true') {
    query += ` AND q.attachment_full IS NOT NULL AND q.attachment_full != ''`;
  } else if (filters.hasImage === 'false') {
    query += ` AND (q.attachment_full IS NULL OR q.attachment_full = '')`;
  }

  if (filters.hasImageType === 'true') {
    query += ` AND q.attachment_full IS NOT NULL AND q.attachment_full != '' AND q.attachment_type = 'image'`;
  } else if (filters.hasImageType === 'false') {
    query += ` AND q.attachment_full IS NOT NULL AND q.attachment_full != '' AND (q.attachment_type IS NULL OR q.attachment_type != 'image')`;
  }

  if (filters.hasTitle === 'true') {
    query += ` AND q.note_title IS NOT NULL AND q.note_title != '' AND q.note_title != 'No title'`;
  } else if (filters.hasTitle === 'false') {
    query += ` AND (q.note_title IS NULL OR q.note_title = '' OR q.note_title = 'No title')`;
  }

  if (filters.hasText === 'true') {
    query += ` AND q.note_text IS NOT NULL AND q.note_text != ''`;
  } else if (filters.hasText === 'false') {
    query += ` AND (q.note_text IS NULL OR q.note_text = '')`;
  }

  if (filters.noteId && !isNaN(parseInt(filters.noteId))) {
    query += ` AND q.id = $${paramCounter}`;
    params.push(parseInt(filters.noteId));
    paramCounter++;
  }
  
  return { query, params };
}

// Bulk tag operation
app.post("/api/quotes/bulk-tag", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const { filters, tagName, noteIds, noteType: explicitNoteType } = req.body;
    
    if (!tagName || !tagName.trim()) {
      return res.status(400).json({ error: "Tag name is required" });
    }

    let quoteIds;
    if (noteIds && Array.isArray(noteIds) && noteIds.length > 0) {
      quoteIds = noteIds.map(id => parseInt(id, 10));
    } else {
      // Build filter query to get matching quote IDs
      const { query, params } = buildFilterQuery(filters);
      const quotesResult = await client.query(`SELECT q.id ${query}`, params);
      quoteIds = quotesResult.rows.map(r => r.id);
    }
    
    if (quoteIds.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ count: 0, message: "No notes match" });
    }
    
    // Get or create the tag — use explicit noteType (from selection mode) or filter
    const noteType = explicitNoteType || filters?.note_type || 'quote';
    const tagResult = await client.query(
      `INSERT INTO tags (name, type) 
       VALUES ($1, $2) 
       ON CONFLICT (name, type) DO UPDATE SET name = tags.name
       RETURNING id`,
      [tagName.trim(), noteType]
    );
    const tagId = tagResult.rows[0].id;
    
    // Add tag to all filtered quotes
    let taggedCount = 0;
    for (const quoteId of quoteIds) {
      const insertResult = await client.query(
        `INSERT INTO note_tags (note_id, tag_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [quoteId, tagId]
      );
      if (insertResult.rows.length > 0) {
        taggedCount++;
      }
    }
    
    await client.query("COMMIT");
    
    res.json({
      count: taggedCount,
      total: quoteIds.length,
      message: `Tagged ${taggedCount} quotes (${quoteIds.length - taggedCount} already had this tag)`
    });
    
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in bulk tag operation:", error);
    res.status(500).json({ error: "Failed to tag quotes" });
  } finally {
    client.release();
  }
});

// Bulk set translation group
app.post("/api/quotes/bulk-set-group", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { filters, groupName, noteIds } = req.body;

    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    let quoteIds;
    if (noteIds && Array.isArray(noteIds) && noteIds.length > 0) {
      quoteIds = noteIds.map(id => parseInt(id, 10));
    } else {
      const { query, params } = buildFilterQuery(filters);
      const quotesResult = await client.query(`SELECT q.id ${query}`, params);
      quoteIds = quotesResult.rows.map(r => r.id);
    }

    if (quoteIds.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ count: 0, message: "No notes match" });
    }

    await client.query(
      `UPDATE notes SET translation_group = $1 WHERE id = ANY($2::int[])`,
      [groupName.trim(), quoteIds]
    );

    await client.query("COMMIT");
    res.json({ count: quoteIds.length, message: `Set group on ${quoteIds.length} notes` });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in bulk set-group:", error);
    res.status(500).json({ error: "Failed to set group" });
  } finally {
    client.release();
  }
});

// Bulk untag (remove tag) operation
app.post("/api/quotes/bulk-untag", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const { filters, tagName, noteIds, noteType: explicitNoteType } = req.body;
    
    if (!tagName || !tagName.trim()) {
      return res.status(400).json({ error: "Tag name is required" });
    }

    let quoteIds;
    if (noteIds && Array.isArray(noteIds) && noteIds.length > 0) {
      quoteIds = noteIds.map(id => parseInt(id, 10));
    } else {
      const { query, params } = buildFilterQuery(filters);
      const quotesResult = await client.query(`SELECT q.id ${query}`, params);
      quoteIds = quotesResult.rows.map(r => r.id);
    }
    
    if (quoteIds.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ count: 0, message: "No notes match" });
    }
    
    // Find the tag
    const noteType = explicitNoteType || filters?.note_type || 'quote';
    const tagResult = await client.query(
      `SELECT id FROM tags WHERE name = $1 AND type = $2`,
      [tagName.trim(), noteType]
    );
    
    if (tagResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ count: 0, message: `Tag "${tagName}" not found for type "${noteType}"` });
    }
    
    const tagId = tagResult.rows[0].id;
    
    // Remove tag from matching notes
    const deleteResult = await client.query(
      `DELETE FROM note_tags 
       WHERE tag_id = $1 AND note_id = ANY($2)
       RETURNING *`,
      [tagId, quoteIds]
    );
    
    await client.query("COMMIT");
    
    res.json({
      count: deleteResult.rowCount,
      total: quoteIds.length,
      message: `Removed tag from ${deleteResult.rowCount} notes (${quoteIds.length - deleteResult.rowCount} didn't have this tag)`
    });
    
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in bulk untag operation:", error);
    res.status(500).json({ error: "Failed to remove tag from notes" });
  } finally {
    client.release();
  }
});

// Bulk delete operation
app.post("/api/quotes/bulk-duplicate", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { filters, noteIds, excludeIds } = req.body;
    const excludeSet = new Set(
      Array.isArray(excludeIds) ? excludeIds.map(id => parseInt(id, 10)).filter(Number.isFinite) : []
    );

    let quoteIds;
    if (noteIds && Array.isArray(noteIds) && noteIds.length > 0) {
      quoteIds = noteIds.map(id => parseInt(id, 10));
    } else {
      const { query, params } = buildFilterQuery(filters);
      const result = await client.query(`SELECT q.id ${query}`, params);
      quoteIds = result.rows.map(r => r.id);
    }

    if (excludeSet.size > 0) {
      quoteIds = quoteIds.filter(id => !excludeSet.has(id));
    }

    if (quoteIds.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ count: 0, message: "No notes match" });
    }

    for (const oldId of quoteIds) {
      // 1. Fetch original note row
      const noteRes = await client.query(
        `SELECT note_text, note_title, author_id, source_id, type, score, thumbnail, attachment_full,
                attachment_type, attachment_filename, comment, translation_group, note_type, note_date
         FROM notes WHERE id = $1`,
        [oldId]
      );
      if (noteRes.rows.length === 0) continue;
      const orig = noteRes.rows[0];

      // 2. Insert new note (flat attachment refs copied after we have the new ID)
      const insertRes = await client.query(
        `INSERT INTO notes
           (note_text, note_title, author_id, source_id, type, score, thumbnail, attachment_full,
            attachment_type, attachment_filename, comment, translation_group, note_type, note_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
          orig.note_text, orig.note_title, orig.author_id, orig.source_id, orig.type, orig.score,
          orig.thumbnail, orig.attachment_full, orig.attachment_type, orig.attachment_filename,
          orig.comment, orig.translation_group, orig.note_type, orig.note_date
        ]
      );
      const newId = insertRes.rows[0].id;

      // 3. Copy flat-column attachment files (thumbnail / attachment_full)
      const newThumb = fileStorage.copyAttachmentFile(orig.thumbnail, oldId, newId);
      const newFull  = fileStorage.copyAttachmentFile(orig.attachment_full, oldId, newId);
      if (newThumb !== orig.thumbnail || newFull !== orig.attachment_full) {
        await client.query(
          `UPDATE notes SET thumbnail = $1, attachment_full = $2 WHERE id = $3`,
          [newThumb, newFull, newId]
        );
      }

      // 4. Copy note_attachments rows (with copied files)
      const attRes = await client.query(
        `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
        [oldId]
      );
      for (const att of attRes.rows) {
        let newAttThumb, newAttFull;

        if (att.position === 0) {
          // Position 0 was already handled by step 3 — reuse those file refs.
          // The primary attachment file may be named "{noteId}.jpg" (created with the
          // note) or "{noteId}_a0.jpg" (added later). Either way step 3 copied it
          // correctly; using its result here avoids a key-mismatch that would leave
          // the new note's note_attachments row pointing at the *original* file.
          newAttThumb = newThumb;
          newAttFull  = newFull;
        } else {
          // Extra attachments are always named "{noteId}_a{position}.ext"
          const oldKey = `${oldId}_a${att.position}`;
          const newKey = `${newId}_a${att.position}`;
          newAttThumb = fileStorage.copyAttachmentFile(att.thumbnail, oldKey, newKey);
          newAttFull  = fileStorage.copyAttachmentFile(att.attachment_full, oldKey, newKey);
        }

        await client.query(
          `INSERT INTO note_attachments
             (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [newId, att.position, newAttThumb, newAttFull, att.attachment_type, att.storage_type, att.filename]
        );
      }

      // 5. Copy tags
      await client.query(
        `INSERT INTO note_tags (note_id, tag_id)
         SELECT $1, tag_id FROM note_tags WHERE note_id = $2
         ON CONFLICT DO NOTHING`,
        [newId, oldId]
      );
    }

    await client.query("COMMIT");
    res.json({ count: quoteIds.length, message: `Duplicated ${quoteIds.length} note${quoteIds.length !== 1 ? 's' : ''}` });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in bulk-duplicate:", error);
    res.status(500).json({ error: "Failed to duplicate notes" });
  } finally {
    client.release();
  }
});

// POST /api/quotes/bulk-split
// For each selected note that has 2+ attachments:
//   - Keep the original note with only its position-0 attachment.
//   - For each extra attachment (positions 1, 2, …) create a new note that is an
//     exact copy of the original (text, author, source, tags, etc.) but carries
//     only that single attachment (at position 0).
// Notes with 0 or 1 attachment are skipped silently.
app.post("/api/quotes/bulk-split", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { filters, noteIds, excludeIds } = req.body;
    const excludeSet = new Set(
      Array.isArray(excludeIds) ? excludeIds.map(id => parseInt(id, 10)).filter(Number.isFinite) : []
    );

    let quoteIds;
    if (noteIds && Array.isArray(noteIds) && noteIds.length > 0) {
      quoteIds = noteIds.map(id => parseInt(id, 10));
    } else {
      const { query, params } = buildFilterQuery(filters);
      const result = await client.query(`SELECT q.id ${query}`, params);
      quoteIds = result.rows.map(r => r.id);
    }

    if (excludeSet.size > 0) {
      quoteIds = quoteIds.filter(id => !excludeSet.has(id));
    }

    if (quoteIds.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ splitCount: 0, newNotes: 0, message: "No notes match" });
    }

    let splitCount = 0; // original notes that were split
    let newNotes   = 0; // total new notes created

    for (const origId of quoteIds) {
      // Fetch the original note row
      const noteRes = await client.query(
        `SELECT note_text, note_title, author_id, source_id, type, score, comment,
                translation_group, note_type, note_date
         FROM notes WHERE id = $1`,
        [origId]
      );
      if (noteRes.rows.length === 0) continue;
      const orig = noteRes.rows[0];

      // Fetch all attachments ordered by position
      const attRes = await client.query(
        `SELECT * FROM note_attachments WHERE note_id = $1 ORDER BY position`,
        [origId]
      );
      const atts = attRes.rows;
      if (atts.length < 2) continue; // nothing to split

      splitCount++;

      // For each extra attachment create a new note
      for (let i = 1; i < atts.length; i++) {
        const att = atts[i];

        // 1. Insert new note (no attachment columns yet — filled below)
        const insRes = await client.query(
          `INSERT INTO notes
             (note_text, note_title, author_id, source_id, type, score, comment,
              translation_group, note_type, note_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            orig.note_text, orig.note_title, orig.author_id, orig.source_id, orig.type, orig.score,
            orig.comment, orig.translation_group, orig.note_type, orig.note_date
          ]
        );
        const newId = insRes.rows[0].id;

        // 2. Copy the attachment file to a name based on newId.
        //    Extra attachments may be named "{origId}_{pos}.jpg" (old convention)
        //    or "{origId}_a{pos}.jpg" (new convention).  We try both.
        //    The new note owns it at position 0, so target key is just newId.
        let newAttThumb = att.thumbnail; // thumbnails are usually base64 — safe to share
        let newAttFull  = fileStorage.copyAttachmentFile(att.attachment_full, `${origId}_a${att.position}`, String(newId));
        if (newAttFull === att.attachment_full) {
          // Key didn't match — try old "_pos" convention
          newAttFull = fileStorage.copyAttachmentFile(att.attachment_full, `${origId}_${att.position}`, String(newId));
        }
        if (newAttFull === att.attachment_full) {
          // Still no match — fall back to copying with the raw origId as key
          newAttFull = fileStorage.copyAttachmentFile(att.attachment_full, String(origId), String(newId));
        }

        // 3. Update notes flat columns for the new note
        await client.query(
          `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
          [newAttThumb, newAttFull, att.attachment_type, newId]
        );

        // 4. Insert note_attachments row (position 0 for the new note)
        await client.query(
          `INSERT INTO note_attachments
             (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
           VALUES ($1, 0, $2, $3, $4, $5, $6)`,
          [newId, newAttThumb, newAttFull, att.attachment_type, att.storage_type, att.filename]
        );

        // 5. Copy tags from original
        await client.query(
          `INSERT INTO note_tags (note_id, tag_id)
           SELECT $1, tag_id FROM note_tags WHERE note_id = $2
           ON CONFLICT DO NOTHING`,
          [newId, origId]
        );

        newNotes++;
      }

      // Remove the extra attachments (positions 1…) from the original note.
      // Delete filesystem files for each one first.
      for (let i = 1; i < atts.length; i++) {
        const att = atts[i];
        if (att.thumbnail)       fileStorage.deleteAttachment(att.thumbnail);
        if (att.attachment_full) fileStorage.deleteAttachment(att.attachment_full);
        await client.query(`DELETE FROM note_attachments WHERE id = $1`, [att.id]);
      }

      // Re-number the remaining attachments on the original (now just position 0)
      await client.query(
        `UPDATE note_attachments SET position = pos_rank - 1
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS pos_rank
               FROM note_attachments WHERE note_id = $1) ranked
         WHERE note_attachments.id = ranked.id`,
        [origId]
      );

      // Sync the original note's flat columns with position 0 (unchanged but tidy)
      const firstAtt = atts[0];
      await client.query(
        `UPDATE notes SET thumbnail = $1, attachment_full = $2, attachment_type = $3 WHERE id = $4`,
        [firstAtt.thumbnail, firstAtt.attachment_full, firstAtt.attachment_type, origId]
      );
    }

    await client.query("COMMIT");
    res.json({
      splitCount,
      newNotes,
      message: splitCount === 0
        ? "No multi-attachment notes found to split"
        : `Split ${splitCount} note${splitCount !== 1 ? 's' : ''} → created ${newNotes} new note${newNotes !== 1 ? 's' : ''}`
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in bulk-split:", error);
    res.status(500).json({ error: "Failed to split notes" });
  } finally {
    client.release();
  }
});

app.post("/api/quotes/bulk-delete", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const { filters, noteIds, excludeIds } = req.body;
    const excludeSet = new Set(
      Array.isArray(excludeIds) ? excludeIds.map(id => parseInt(id, 10)).filter(Number.isFinite) : []
    );

    let notesResult;
    if (noteIds && Array.isArray(noteIds) && noteIds.length > 0) {
      notesResult = await client.query(
        `SELECT id, thumbnail, attachment_full FROM notes WHERE id = ANY($1::int[])`,
        [noteIds.map(id => parseInt(id, 10))]
      );
    } else {
      const { query, params } = buildFilterQuery(filters);
      notesResult = await client.query(
        `SELECT q.id, q.thumbnail, q.attachment_full ${query}`,
        params
      );
    }

    if (excludeSet.size > 0) {
      notesResult.rows = notesResult.rows.filter(r => !excludeSet.has(r.id));
    }

    if (notesResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ count: 0, message: "No notes match" });
    }
    
    // Delete external files for each note
    for (const note of notesResult.rows) {
      fileStorage.deleteAttachment(note.thumbnail);
      fileStorage.deleteAttachment(note.attachment_full);
    }
    
    // Delete all matching notes
    const quoteIds = notesResult.rows.map(r => r.id);
    const deleteResult = await client.query(
      `DELETE FROM notes WHERE id = ANY($1)`,
      [quoteIds]
    );
    
    await client.query("COMMIT");
    
    res.json({
      count: deleteResult.rowCount,
      message: `Deleted ${deleteResult.rowCount} notes`
    });
    
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in bulk delete operation:", error);
    res.status(500).json({ error: "Failed to delete notes" });
  } finally {
    client.release();
  }
});

// ============= TAGS API =============

// Get tags that co-occur with ALL of the given tags on notes of a given type.
// Used by the browse-tags feature.
// Query: ?tags=tag1,tag2&type=historical
app.get("/api/tags/co-occurring", async (req, res) => {
  try {
    const { tags: tagsParam, type } = req.query;
    if (!tagsParam) return res.json([]);
    const tagList = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
    if (tagList.length === 0) return res.json([]);

    // Find notes that have ALL of the requested tags (no note_type filter —
    // the tag's own type may differ from note_type depending on import origin).
    // Then return other tags that appear on those notes, optionally filtered
    // by tag type so the browse strip stays within the chosen tag category.
    const params = [tagList, tagList.length];
    let tagTypeClause = '';
    if (type) {
      params.push(type);
      tagTypeClause = `AND t.type = $${params.length}`;
    }


    const result = await pool.query(`
      SELECT t.id, t.name, t.type,
             COUNT(DISTINCT nt.note_id) AS quote_count
      FROM tags t
      JOIN note_tags nt ON t.id = nt.tag_id
      WHERE nt.note_id IN (
        SELECT nt2.note_id
        FROM note_tags nt2
        JOIN tags t2 ON t2.id = nt2.tag_id
        WHERE t2.name = ANY($1::text[])
        GROUP BY nt2.note_id
        HAVING COUNT(DISTINCT t2.name) = $2
      )
      AND t.name != ALL($1::text[])
      ${tagTypeClause}
      GROUP BY t.id, t.name, t.type
      ORDER BY quote_count DESC, t.name
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('co-occurring tags error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all tags with quote counts
app.get("/api/tags", async (req, res) => {
  try {
    const { type, search } = req.query; // e.g., ?type=note&search=foo
    
    let query = `
      SELECT t.id, t.name, t.type, COUNT(qt.note_id)::int as quote_count
      FROM tags t
      LEFT JOIN note_tags qt ON t.id = qt.tag_id
    `;
    
    const params = [];
    const conditions = [];
    let paramCounter = 1;
    
    if (type) {
      conditions.push(`t.type = $${paramCounter}`);
      params.push(type);
      paramCounter++;
    }
    
    if (search) {
      conditions.push(`t.name ILIKE $${paramCounter}`);
      params.push(`%${search}%`);
      paramCounter++;
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }
    
    query += `
      GROUP BY t.id, t.name, t.type
      ORDER BY t.name ASC
    `;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// Create new tag
app.post("/api/tags", async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Tag name is required" });
    }
    
    const result = await pool.query(
      `INSERT INTO tags (name) 
       VALUES ($1) 
       ON CONFLICT (name) DO UPDATE SET name = tags.name
       RETURNING *`,
      [name.trim()]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating tag:", error);
    res.status(500).json({ error: "Failed to create tag" });
  }
});

// Rename tag (with auto-merge detection)
app.put("/api/tags/:id", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Tag name is required" });
    }
    
    const trimmedName = name.trim();
    
    // Check if tag exists
    const tagCheck = await client.query(
      "SELECT id, name FROM tags WHERE id = $1",
      [id]
    );
    
    if (tagCheck.rows.length === 0) {
      return res.status(404).json({ error: "Tag not found" });
    }
    
    const oldName = tagCheck.rows[0].name;
    
    // Check if target name already exists
    const existingTag = await client.query(
      "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1) AND id != $2",
      [trimmedName, id]
    );
    
    if (existingTag.rows.length > 0) {
      // Tag with this name exists - need to merge
      const targetTagId = existingTag.rows[0].id;
      
      // Move all quote associations from old tag to existing tag
      await client.query(`
        INSERT INTO note_tags (note_id, tag_id)
        SELECT note_id, $1
        FROM note_tags
        WHERE tag_id = $2
        ON CONFLICT (note_id, tag_id) DO NOTHING
      `, [targetTagId, id]);
      
      // Delete the old tag (cascade will remove old associations)
      await client.query("DELETE FROM tags WHERE id = $1", [id]);
      
      await client.query("COMMIT");
      
      return res.json({
        merged: true,
        oldName,
        newName: existingTag.rows[0].name,
        targetTagId,
        message: `Tag "${oldName}" merged into existing tag "${existingTag.rows[0].name}"`
      });
    } else {
      // Simple rename
      await client.query(
        "UPDATE tags SET name = $1 WHERE id = $2",
        [trimmedName, id]
      );
      
      await client.query("COMMIT");
      
      return res.json({
        merged: false,
        oldName,
        newName: trimmedName,
        message: `Tag renamed from "${oldName}" to "${trimmedName}"`
      });
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error renaming tag:", error);
    res.status(500).json({ error: "Failed to rename tag" });
  } finally {
    client.release();
  }
});

// Delete tag
app.delete("/api/tags/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const { id } = req.params;
    
    // Get quotes that have this tag before deleting
    const quotesWithTag = await client.query(
      "SELECT note_id FROM note_tags WHERE tag_id = $1",
      [id]
    );
    const affectedQuoteIds = quotesWithTag.rows.map(row => row.note_id);
    
    // Delete the tag (CASCADE will remove note_tags entries)
    const result = await client.query(
      "DELETE FROM tags WHERE id = $1 RETURNING name",
      [id]
    );
    
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Tag not found" });
    }
    
    // Update the old tags column for affected quotes
    for (const quoteId of affectedQuoteIds) {
      const remainingTags = await client.query(
        `SELECT t.name FROM tags t 
         JOIN note_tags qt ON t.id = qt.tag_id 
         WHERE qt.note_id = $1 
         ORDER BY t.name`,
        [quoteId]
      );
    }
    
    await client.query("COMMIT");
    
    res.json({ 
      message: `Tag "${result.rows[0].name}" deleted successfully` 
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error deleting tag:", error);
    res.status(500).json({ error: "Failed to delete tag" });
  } finally {
    client.release();
  }
});

// Add tag to all quotes that have another tag
app.post("/api/tags/bulk-add", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
    
    const { sourceTagName, targetTagName } = req.body;
    
    if (!sourceTagName || !targetTagName) {
      return res.status(400).json({ error: "Both source and target tag names are required" });
    }
    
    if (sourceTagName.toLowerCase() === targetTagName.toLowerCase()) {
      return res.status(400).json({ error: "Source and target tags cannot be the same" });
    }
    
    // Find or create source tag
    let sourceTag = await client.query(
      "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1)",
      [sourceTagName]
    );
    
    if (sourceTag.rows.length === 0) {
      return res.status(404).json({ error: `Source tag "${sourceTagName}" not found` });
    }
    
    sourceTag = sourceTag.rows[0];
    
    // Find or create target tag
    let targetTag = await client.query(
      "SELECT id, name FROM tags WHERE LOWER(name) = LOWER($1)",
      [targetTagName]
    );
    
    if (targetTag.rows.length === 0) {
      // Create the target tag if it doesn't exist
      const newTag = await client.query(
        "INSERT INTO tags (name) VALUES ($1) RETURNING id, name",
        [targetTagName]
      );
      targetTag = newTag.rows[0];
    } else {
      targetTag = targetTag.rows[0];
    }
    
    // Add target tag to all quotes that have source tag (if not already present)
    const result = await client.query(`
      INSERT INTO note_tags (note_id, tag_id)
      SELECT qt.note_id, $1
      FROM note_tags qt
      WHERE qt.tag_id = $2
      ON CONFLICT (note_id, tag_id) DO NOTHING
      RETURNING note_id
    `, [targetTag.id, sourceTag.id]);
    
    const affectedCount = result.rows.length;
    
    await client.query("COMMIT");
    
    res.json({
      success: true,
      affectedCount,
      sourceTag: sourceTag.name,
      targetTag: targetTag.name,
      message: `Added tag "${targetTag.name}" to ${affectedCount} note(s) that have tag "${sourceTag.name}"`
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error bulk adding tag:", error);
    res.status(500).json({ error: "Failed to bulk add tag" });
  } finally {
    client.release();
  }
});

// ============= DATA EXPORT/IMPORT (JSON) =============

// Remembers big-file entries from the most recent export so the companion
// big-files report can be served immediately after without reprocessing.
let _lastExportBigFiles = [];
/** Dedupe ZIP/report entries when the same vault path appears on multiple rows */
let _lastExportBigFilePaths = new Set();

/**
 * Resolve a single attachment value for JSON export:
 *  - null / undefined / base64 string  → returned as-is
 *  - file: reference, file ≤ 2 MB      → read from disk, return as base64 data URL
 *  - file: reference, file  > 2 MB     → push to bigFiles list, return original ref
 */
function resolveAttachmentForExport(value, noteId, bigFiles, thresholdMB = 1) {
  if (!value || !fileStorage.isFilePath(value)) return value;

  const { path: relPath, mimeType } = fileStorage.parseFilePath(value);
  const fullPath = path.join(fileStorage.getAttachmentsDir(), relPath);

  if (!fs.existsSync(fullPath)) return value; // missing file — keep ref, don't crash

  const sizeBytes = fs.statSync(fullPath).size;
  const sizeMB    = sizeBytes / 1024 / 1024;

  if (sizeMB > thresholdMB) {
    if (!_lastExportBigFilePaths.has(relPath)) {
      _lastExportBigFilePaths.add(relPath);
      bigFiles.push({ noteId, path: relPath, sizeMB: sizeMB.toFixed(2) });
    }
    return value; // keep file: reference — too large to embed
  }

  // Small enough — embed as base64 data URL (same format the import already handles)
  const buffer = fs.readFileSync(fullPath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Normalize a value for PostgreSQL `DATE` (calendar day only).
 * - Export: avoids JSON.stringify(Date) → ISO midnight shifting on re-import.
 * - Import: accepts legacy ISO strings and stores the intended calendar day.
 */
function toPgDateOnlyString(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "string") {
    const m = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const mo = String(val.getMonth() + 1).padStart(2, "0");
    const day = String(val.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  return null;
}

/** Honor TCP backpressure so chunked JSON export does not buffer unbounded RAM. */
function writeExportChunk(res, chunk, encoding = "utf8") {
  return new Promise((resolve, reject) => {
    const onErr = (err) => {
      res.off("drain", onDrain);
      reject(err);
    };
    const onDrain = () => {
      res.off("error", onErr);
      resolve();
    };
    res.once("error", onErr);
    try {
      const ok =
        typeof chunk === "string"
          ? res.write(chunk, encoding)
          : res.write(chunk);
      if (ok) {
        res.off("error", onErr);
        resolve();
      } else {
        res.once("drain", onDrain);
      }
    } catch (e) {
      res.off("error", onErr);
      reject(e);
    }
  });
}

function endExportResponse(res) {
  return new Promise((resolve, reject) => {
    res.end((err) => (err ? reject(err) : resolve()));
  });
}

// Export all data as JSON
app.get("/api/export/json", async (req, res) => {
  const { note_type } = req.query;

  // Stream the response immediately so the browser doesn't time out and we
  // never build one giant JSON string in memory (avoids "Invalid string length").
  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=quotes_backup_${new Date().toISOString().split("T")[0]}.json`,
  );

  try {
    req.on("close", () => {
      if (!res.writableEnded) {
        console.warn("[export/json] client closed connection before export finished");
      }
    });
    res.on("error", (err) => {
      console.error("[export/json] response stream error:", err?.message || err);
    });

    _lastExportBigFiles = []; // reset for this run
    _lastExportBigFilePaths.clear();

    // Read the embed-threshold from settings (repurposed from old DB storage threshold)
    let exportEmbedThresholdMB = 1; // default: 1 MB
    try {
      const settingsRaw = fs.readFileSync(getSettingsFile(), 'utf8');
      const settings    = JSON.parse(settingsRaw);
      const rawThresh   = settings?.externalStorageThreshold;
      if (rawThresh != null && rawThresh !== "") {
        const n = Number(rawThresh);
        if (Number.isFinite(n) && n > 0) {
          exportEmbedThresholdMB = n;
        }
      }
    } catch (_) { /* use default if settings unreadable */ }

    console.log("[export/json] start", {
      note_type: note_type || "all",
      exportEmbedThresholdMB,
    });

    // ── Small tables: authors, sources, tags ─────────────────────────────────
    const authorsResult = await pool.query("SELECT * FROM authors ORDER BY id");
    const sourcesResult = await pool.query("SELECT * FROM sources ORDER BY id");
    const tagsResult    = await pool.query("SELECT * FROM tags    ORDER BY id");

    // ── Quote count (for the counts header) ──────────────────────────────────
    const countParams = note_type ? [note_type] : [];
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM notes${note_type ? ' WHERE note_type = $1' : ''}`,
      countParams
    );
    const quoteCount = parseInt(countResult.rows[0].count, 10);

    const counts = {
      authors: authorsResult.rows.length,
      sources: sourcesResult.rows.length,
      tags:    tagsResult.rows.length,
      quotes:  quoteCount,
    };


    // ── Write JSON preamble ───────────────────────────────────────────────────
    await writeExportChunk(res, '{"version":"2.0"');
    await writeExportChunk(res, `,"exportedAt":${JSON.stringify(new Date().toISOString())}`);
    await writeExportChunk(res, `,"noteTypeFilter":${JSON.stringify(note_type || "all")}`);
    await writeExportChunk(res, `,"counts":${JSON.stringify(counts)}`);
    await writeExportChunk(res, `,"data":{"authors":${JSON.stringify(authorsResult.rows)}`);
    await writeExportChunk(res, `,"sources":${JSON.stringify(sourcesResult.rows)}`);
    await writeExportChunk(res, `,"tags":${JSON.stringify(tagsResult.rows)}`);
    await writeExportChunk(res, ',"quotes":[');

    // ── Stream notes in batches using cursor pagination ───────────────────────
    // Each batch uses a single query with json_agg to avoid N+1 tag queries.
    const BATCH = 200;
    let lastId  = 0;
    let first   = true;
    const noteTypeClause = note_type ? 'AND q.note_type = $3' : '';

    while (true) {
      const params = note_type ? [lastId, BATCH, note_type] : [lastId, BATCH];
      const batch  = await pool.query(
        `SELECT q.*,
                a.name AS author_name,
                s.name AS source_name,
                COALESCE(
                  json_agg(json_build_object('id', t.id, 'name', t.name, 'type', t.type))
                  FILTER (WHERE t.id IS NOT NULL),
                  '[]'::json
                ) AS tag_objects
         FROM notes q
         LEFT JOIN authors   a  ON a.id = q.author_id
         LEFT JOIN sources   s  ON s.id = q.source_id
         LEFT JOIN note_tags nt ON nt.note_id = q.id
         LEFT JOIN tags      t  ON t.id = nt.tag_id
         WHERE q.id > $1 ${noteTypeClause}
         GROUP BY q.id, a.name, s.name
         ORDER BY q.id
         LIMIT $2`,
        params
      );

      if (batch.rows.length === 0) break;

      const noteIds = batch.rows.map((r) => r.id);
      const attByNote = new Map();
      if (noteIds.length > 0) {
        const attResult = await pool.query(
          `SELECT note_id, position, thumbnail, attachment_full, attachment_type, filename
           FROM note_attachments
           WHERE note_id = ANY($1::int[])
           ORDER BY note_id, position`,
          [noteIds],
        );
        for (const att of attResult.rows) {
          if (!attByNote.has(att.note_id)) attByNote.set(att.note_id, []);
          attByNote.get(att.note_id).push(att);
        }
      }

      for (const note of batch.rows) {
        const attRows = attByNote.get(note.id);
        if (attRows && attRows.length > 0) {
          // Primary storage is note_attachments (tegneserie, multi-attach, migrated notes).
          // Import prefers `attachments` when present — do not duplicate onto flat fields
          // (q.* would re-serialize the same blobs twice and ~double export size).
          note.attachments = attRows.map((att) => ({
            position: att.position,
            thumbnail: resolveAttachmentForExport(
              att.thumbnail,
              note.id,
              _lastExportBigFiles,
              exportEmbedThresholdMB,
            ),
            attachment_full: resolveAttachmentForExport(
              att.attachment_full,
              note.id,
              _lastExportBigFiles,
              exportEmbedThresholdMB,
            ),
            attachment_type: att.attachment_type,
            filename: att.filename,
          }));
          const primaryRow = attRows.find((a) => a.position === 0) || attRows[0];
          if (primaryRow.attachment_type) note.attachment_type = primaryRow.attachment_type;
          // Import prefers `attachments` when present. `SELECT q.*` still puts
          // thumbnail / attachment_full on the row — omit them here or the same
          // bytes appear twice in JSON (near ~2× export size after migration).
          delete note.thumbnail;
          delete note.attachment_full;
        } else {
          // Legacy: attachments only on notes row
          note.attachment_full = resolveAttachmentForExport(
            note.attachment_full,
            note.id,
            _lastExportBigFiles,
            exportEmbedThresholdMB,
          );
          note.thumbnail = resolveAttachmentForExport(
            note.thumbnail,
            note.id,
            _lastExportBigFiles,
            exportEmbedThresholdMB,
          );
        }
        if (!first) await writeExportChunk(res, ",");
        note.note_date = toPgDateOnlyString(note.note_date);
        await writeExportChunk(res, JSON.stringify(note));
        first = false;
      }

      lastId = batch.rows[batch.rows.length - 1].id;
      if (batch.rows.length < BATCH) break;
    }

    await writeExportChunk(
      res,
      `],"_bigFilesCount":${_lastExportBigFiles.length}}}`,
    );
    await endExportResponse(res);
    console.log("[export/json] done", { quotes: quoteCount });

  } catch (error) {
    console.error("Error exporting data:", error);
    // If headers not sent yet we can send a proper error; otherwise just end.
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to export data", details: error.message });
    } else {
      res.end();
    }
  }
});

// Returns a human-readable .txt report of large files that were NOT embedded
// in the most recent JSON export (because they exceeded the 2 MB threshold).
app.get("/api/export/big-files-report", (req, res) => {
  if (_lastExportBigFiles.length === 0) {
    return res.status(204).end(); // no content — no big files
  }

  const ts = new Date().toISOString();
  const lines = [
    `NoteArchive Export — ${ts}`,
    `Large attachments NOT embedded in JSON (kept as file references; see embed threshold in Settings):`,
    `These files must be present in your vault to be usable after import.`,
    ``,
  ];

  let totalMB = 0;
  for (const f of _lastExportBigFiles) {
    lines.push(`Note ${String(f.noteId).padEnd(6)}  ${f.path.padEnd(50)}  ${f.sizeMB} MB`);
    totalMB += parseFloat(f.sizeMB);
  }
  lines.push('');
  lines.push(`Total: ${_lastExportBigFiles.length} file(s), ${totalMB.toFixed(1)} MB`);

  const date = ts.split('T')[0];
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="big_files_${date}.txt"`);
  res.send(lines.join('\n'));
});

// Returns count + total MB of big files (from last export run) so the client
// can warn the user before starting the potentially large ZIP download.
app.get("/api/export/big-files-info", (req, res) => {
  const totalMB = _lastExportBigFiles.reduce((s, f) => s + parseFloat(f.sizeMB), 0);
  res.json({ count: _lastExportBigFiles.length, totalMB: parseFloat(totalMB.toFixed(1)) });
});

// Streams a ZIP archive of all large attachments that were not embedded in the
// most recent JSON export.  Uses archiver for streaming — no temp file on disk.
app.get("/api/export/big-files-zip", (req, res) => {
  if (_lastExportBigFiles.length === 0) {
    return res.status(204).end();
  }

  const date = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="big_files_${date}.zip"`);

  const archive = archiver('zip', { zlib: { level: 1 } }); // level 1: fast, minimal compression (files are already compressed)
  archive.pipe(res);

  for (const f of _lastExportBigFiles) {
    const fullPath = path.join(fileStorage.getAttachmentsDir(), f.path);
    if (fs.existsSync(fullPath)) {
      // Preserve the subfolder structure inside the ZIP (e.g. historical/5236.wav)
      archive.file(fullPath, { name: f.path });
    }
  }

  archive.finalize();

  archive.on('error', (err) => {
    console.error('ZIP archive error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
});

/**
 * Align notes.id SERIAL with MAX(id). Required for JSON import when the
 * sequence is behind (manual restores, older tools) — otherwise INSERT …
 * RETURNING id picks an id that already exists and aborts the transaction.
 */
async function syncNotesIdSequence(client) {
  const { rows } = await client.query(
    "SELECT pg_get_serial_sequence('notes', 'id') AS seq",
  );
  const seq = rows[0]?.seq;
  if (!seq) return;
  await client.query(
    `SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM notes), 1), true)`,
    [seq],
  );
}

// Import data from JSON
app.post("/api/import/json", async (req, res) => {
  const client = await pool.connect();

  try {
    const { data, options } = req.body;

    if (!data || !data.authors || !data.sources || !data.quotes) {
      return res.status(400).json({ error: "Invalid import data structure" });
    }

    await client.query("BEGIN");

    const stats = {
      authors: { created: 0, updated: 0, skipped: 0 },
      sources: { created: 0, updated: 0, skipped: 0 },
      tags: { created: 0, updated: 0, skipped: 0 },
      quotes: { created: 0, updated: 0, skipped: 0 },
      errors: [],
    };

    // JSON export uses DB column names (`image`). Older backups may still use `thumbnail`.
    const authorImage = (a) => a.image ?? a.thumbnail ?? "";
    const authorDesc = (a) => a.description ?? "";
    const sourceImage = (s) => s.image ?? s.thumbnail ?? "";

    // Import authors
    for (const author of data.authors) {
      await client.query("SAVEPOINT import_author");
      try {
        if (options?.replaceExisting) {
          // Replace: upsert by name
          const result = await client.query(
            `INSERT INTO authors (name, image, description) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (name) DO UPDATE 
             SET image = EXCLUDED.image, description = EXCLUDED.description
             RETURNING id, (xmax = 0) as inserted`,
            [author.name, authorImage(author), authorDesc(author)],
          );
          if (result.rows[0].inserted) {
            stats.authors.created++;
          } else {
            stats.authors.updated++;
          }
        } else {
          // Skip if exists
          const existing = await client.query(
            "SELECT id FROM authors WHERE name = $1",
            [author.name],
          );
          if (existing.rows.length > 0) {
            stats.authors.skipped++;
          } else {
            await client.query(
              "INSERT INTO authors (name, image, description) VALUES ($1, $2, $3)",
              [author.name, authorImage(author), authorDesc(author)],
            );
            stats.authors.created++;
          }
        }
        await client.query("RELEASE SAVEPOINT import_author");
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT import_author");
        stats.errors.push(`Author "${author.name}": ${error.message}`);
      }
    }

    // Import sources
    for (const source of data.sources) {
      await client.query("SAVEPOINT import_source");
      try {
        if (options?.replaceExisting) {
          const result = await client.query(
            `INSERT INTO sources (name, type, image) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (name) DO UPDATE 
             SET type = EXCLUDED.type, image = EXCLUDED.image
             RETURNING id, (xmax = 0) as inserted`,
            [source.name, source.type, sourceImage(source)],
          );
          if (result.rows[0].inserted) {
            stats.sources.created++;
          } else {
            stats.sources.updated++;
          }
        } else {
          const existing = await client.query(
            "SELECT id FROM sources WHERE name = $1",
            [source.name],
          );
          if (existing.rows.length > 0) {
            stats.sources.skipped++;
          } else {
            await client.query(
              "INSERT INTO sources (name, type, image) VALUES ($1, $2, $3)",
              [source.name, source.type, sourceImage(source)],
            );
            stats.sources.created++;
          }
        }
        await client.query("RELEASE SAVEPOINT import_source");
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT import_source");
        stats.errors.push(`Source "${source.name}": ${error.message}`);
      }
    }

    // Import tags (if present in backup)
    if (data.tags && data.tags.length > 0) {
      for (const tag of data.tags) {
        await client.query("SAVEPOINT import_tag");
        try {
          if (options?.replaceExisting) {
            const result = await client.query(
              `INSERT INTO tags (name, type, created_at) 
               VALUES ($1, $2, $3) 
               ON CONFLICT (name, type) DO UPDATE 
               SET created_at = EXCLUDED.created_at
               RETURNING id, (xmax = 0) as inserted`,
              [tag.name, tag.type || 'quote', tag.created_at],
            );
            if (result.rows[0].inserted) {
              stats.tags.created++;
            } else {
              stats.tags.updated++;
            }
          } else {
            const existing = await client.query(
              "SELECT id FROM tags WHERE name = $1 AND type = $2",
              [tag.name, tag.type || 'quote'],
            );
            if (existing.rows.length > 0) {
              stats.tags.skipped++;
            } else {
              await client.query(
                "INSERT INTO tags (name, type, created_at) VALUES ($1, $2, $3)",
                [tag.name, tag.type || 'quote', tag.created_at],
              );
              stats.tags.created++;
            }
          }
          await client.query("RELEASE SAVEPOINT import_tag");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT import_tag");
          stats.errors.push(`Tag "${tag.name}" (${tag.type}): ${error.message}`);
        }
      }
    }

    // Import quotes
    // Get storage threshold from settings
    const storageThresholdMB = options?.storageThresholdMB || 1;

    await syncNotesIdSequence(client);

    for (const note of data.quotes) {
      await client.query("SAVEPOINT import_note");
      try {
        // Get author_id
        let authorId = null;
        if (note.author_name) {
          const authorResult = await client.query(
            "SELECT id FROM authors WHERE name = $1",
            [note.author_name],
          );
          if (authorResult.rows.length > 0) {
            authorId = authorResult.rows[0].id;
          }
        }

        // Get source_id
        let sourceId = null;
        if (note.source_name) {
          const sourceResult = await client.query(
            "SELECT id FROM sources WHERE name = $1",
            [note.source_name],
          );
          if (sourceResult.rows.length > 0) {
            sourceId = sourceResult.rows[0].id;
          }
        }

        // Check if note already exists (by ID, text, AND author - all must match)
        // Only check if the note has an ID (from backup/restore, not ENEX imports)
        let existing = { rows: [] };
        if (note.id !== null && note.id !== undefined) {
          existing = await client.query(
            `SELECT id FROM notes 
             WHERE id = $1 
             AND note_text = $2 
             AND author_id IS NOT DISTINCT FROM $3`,
            [note.id, note.note_text, authorId],
          );
        }

        if (existing.rows.length > 0) {
          // Exact match found - skip it
          stats.quotes.skipped++;
        } else {
          // Check if ID exists but with different content (modified note)
          let idExists = { rows: [] };
          if (note.id !== null && note.id !== undefined) {
            idExists = await client.query(
              `SELECT id FROM notes WHERE id = $1`,
              [note.id]
            );
          }
          
          let quoteId;
          const noteType = note.note_type || 'quote';

          const importNoteTitle =
            note.note_title !== undefined &&
            note.note_title !== null &&
            String(note.note_title).trim() !== ""
              ? String(note.note_title).trim()
              : null;
          const importScore =
            note.score === undefined || note.score === null || note.score === ""
              ? null
              : String(note.score).trim() || null;
          const importNoteDate = toPgDateOnlyString(note.note_date);
          
          // Check if this import has an ID (from backup/restore) or not (from ENEX/new imports)
          const hasId = note.id !== null && note.id !== undefined;
          
          if (hasId && idExists.rows.length > 0) {
            // ID exists but content is different - this is a modified quote
            // Insert with new auto-generated ID
            const insertResult = await client.query(
              `INSERT INTO notes (note_text, note_title, author_id, source_id, type, comment, note_type, note_date, score,
                                   attachment_type, created_at, updated_at, translation_group)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               RETURNING id`,
              [
                note.note_text,
                importNoteTitle,
                authorId,
                sourceId,
                note.type,
                note.comment,
                noteType,
                importNoteDate,
                importScore,
                note.attachment_type || null,
                note.created_at || new Date(),
                note.updated_at || new Date(),
                note.translation_group || null,
              ],
            );
            quoteId = insertResult.rows[0].id;
          } else if (hasId && idExists.rows.length === 0) {
            // ID doesn't exist - use the original ID from export
            quoteId = note.id;
            await client.query(
              `INSERT INTO notes (id, note_text, note_title, author_id, source_id, type, comment, note_type, note_date, score,
                                   attachment_type, created_at, updated_at, translation_group)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                quoteId,
                note.note_text,
                importNoteTitle,
                authorId,
                sourceId,
                note.type,
                note.comment,
                noteType,
                importNoteDate,
                importScore,
                note.attachment_type || null,
                note.created_at || new Date(),
                note.updated_at || new Date(),
                note.translation_group || null,
              ],
            );
          } else {
            // No ID provided (e.g., ENEX import) - let database auto-generate ID
            const insertResult = await client.query(
              `INSERT INTO notes (note_text, note_title, author_id, source_id, type, comment, note_type, note_date, score,
                                   attachment_type, created_at, updated_at, translation_group)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               RETURNING id`,
              [
                note.note_text,
                importNoteTitle,
                authorId,
                sourceId,
                note.type,
                note.comment,
                noteType,
                importNoteDate,
                importScore,
                note.attachment_type || null,
                note.created_at || new Date(),
                note.updated_at || new Date(),
                note.translation_group || null,
              ],
            );
            quoteId = insertResult.rows[0].id;
          }
          // Use note_type directly as the storage folder name so any new type
          // (historical, puzzle, custom, ...) automatically gets its own directory.
          const storageFolder = noteType || 'quotes';

          // Support both old flat fields and new attachments array from parse-enex
          const attachmentRows = note.attachments && note.attachments.length > 0
            ? note.attachments
            : (note.thumbnail || note.attachment_full)
              ? [{ thumbnail: note.thumbnail, attachment_full: note.attachment_full,
                   attachment_type: note.attachment_type, filename: note.filename,
                   position: 0 }]
              : [];

          let primaryThumb = null, primaryFull = null;

          for (const att of attachmentRows) {
            const pos = att.position ?? 0;
            const suffix = pos === 0 ? '' : `_${pos}`;
            const procThumb = fileStorage.processForStorage(att.thumbnail,       storageFolder, quoteId, suffix ? `${suffix}` : '', storageThresholdMB, false);
            const procFull  = fileStorage.processForStorage(att.attachment_full, storageFolder, quoteId, pos === 0 ? '' : `_${pos}`,              storageThresholdMB, true);

            await client.query(
              `INSERT INTO note_attachments (note_id, position, thumbnail, attachment_full, attachment_type, storage_type, filename)
               VALUES ($1, $2, $3, $4, $5, 'base64', $6)`,
              [quoteId, pos, procThumb || null, procFull || null,
               att.attachment_type || null, att.filename || null]
            );

            if (pos === 0) { primaryThumb = procThumb; primaryFull = procFull; }
          }

          // Update flat columns on notes with position=0 values
          if (primaryThumb || primaryFull) {
            await client.query(
              `UPDATE notes SET thumbnail = $1, attachment_full = $2 WHERE id = $3`,
              [primaryThumb, primaryFull, quoteId]
            );
          }
          
          // Restore tag relationships
          if (note.tag_objects && note.tag_objects.length > 0) {
            for (const tagObj of note.tag_objects) {
              // Find or create tag
              const tagResult = await client.query(
                `INSERT INTO tags (name, type) 
                 VALUES ($1, $2) 
                 ON CONFLICT (name, type) DO UPDATE SET name = tags.name
                 RETURNING id`,
                [tagObj.name, tagObj.type || noteType]
              );
              const tagId = tagResult.rows[0].id;
              
              // Create relationship
              await client.query(
                `INSERT INTO note_tags (note_id, tag_id) 
                 VALUES ($1, $2) 
                 ON CONFLICT DO NOTHING`,
                [quoteId, tagId]
              );
            }
          }
          
          stats.quotes.created++;
        }
        await client.query("RELEASE SAVEPOINT import_note");
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT import_note");
        const preview = (note.note_text && note.note_text.substring(0, 50)) || "";
        stats.errors.push(`Note "${preview}...": ${error.message}`);
      }
    }

    await syncNotesIdSequence(client);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Import completed",
      stats,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error importing data:", error);
    res
      .status(500)
      .json({ error: "Failed to import data", details: error.message });
  } finally {
    client.release();
  }
});

// ============= EXPORT DB ATTACHMENTS =============
// Writes base64 attachments stored in DB to ~/Downloads/DB-attachments/{note_type}/
// Naming: {noteId}.{ext} for single, {noteId}_{pos}.{ext} for multiple per note

app.post("/api/export/db-attachments", async (req, res) => {
  const os   = require('os');
  const outBase = path.join(os.homedir(), 'Downloads', 'DB-attachments');

  try {
    // Collect all base64 attachments from note_attachments (multi-attach notes)
    const multiRows = await pool.query(`
      SELECT na.id, na.note_id, na.position, na.attachment_full, na.thumbnail,
             na.attachment_type, n.note_type
      FROM note_attachments na
      JOIN notes n ON n.id = na.note_id
      WHERE na.attachment_full IS NOT NULL
        AND na.attachment_full NOT LIKE 'file:%'
        AND LENGTH(na.attachment_full) > 100
      ORDER BY na.note_id, na.position
    `);

    // Also collect flat attachment_full from notes not covered by note_attachments
    const flatRows = await pool.query(`
      SELECT n.id AS note_id, -1 AS position, n.attachment_full,
             n.thumbnail, n.attachment_type, n.note_type
      FROM notes n
      WHERE n.attachment_full IS NOT NULL
        AND n.attachment_full NOT LIKE 'file:%'
        AND LENGTH(n.attachment_full) > 100
        AND NOT EXISTS (
          SELECT 1 FROM note_attachments na
          WHERE na.note_id = n.id AND na.attachment_full = n.attachment_full
        )
    `);

    const allRows = [...multiRows.rows, ...flatRows.rows];
    const MIME_TO_EXT = fileStorage.MIME_TO_EXT;

    const results = [];
    let exported = 0;
    let skipped  = 0;

    for (const row of allRows) {
      const raw = row.attachment_full;
      if (!raw || !raw.startsWith('data:')) { skipped++; continue; }

      // Parse data URL
      const mimeMatch = raw.match(/^data:([^;]+);base64,/);
      if (!mimeMatch) { skipped++; continue; }
      const mimeType = mimeMatch[1];

      // Derive extension
      const ext = MIME_TO_EXT[mimeType]
        || mimeType.split('/')[1]?.split(';')[0]?.trim()
        || 'bin';

      // Build filename
      const suffix = row.position >= 0 ? `_${row.position}` : '';
      const filename = `${row.note_id}${suffix}.${ext}`;

      // Sub-folder mirrors the regular attachments layout
      const noteType  = row.note_type || 'notes';
      const outDir    = path.join(outBase, noteType);
      const outFile   = path.join(outDir, filename);

      if (fs.existsSync(outFile)) { skipped++; continue; }

      try {
        fs.mkdirSync(outDir, { recursive: true });
        const base64Data = raw.split(',')[1];
        fs.writeFileSync(outFile, Buffer.from(base64Data, 'base64'));
        exported++;
        results.push({ noteId: row.note_id, file: path.join(noteType, filename) });
      } catch (writeErr) {
        console.error(`Failed to write ${outFile}:`, writeErr.message);
        skipped++;
      }
    }

    res.json({
      ok: true,
      exported,
      skipped,
      outputDir: outBase,
      files: results
    });
  } catch (err) {
    console.error('Export DB attachments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============= MIGRATE: DB base64 attachment_full → disk files =============
// One-time migration: writes every base64 attachment_full to disk and updates the DB
// reference to a "file:..." path.  Thumbnails are left in DB untouched.
// Safe to re-run: notes whose attachment_full is already a file: reference are skipped.

app.post("/api/migrate/attachments-to-disk", async (req, res) => {
  const client = await pool.connect();

  // Consolidate old plural folder names to singular (matching note_type values)
  const FOLDER_RENAMES = { 'quotes': 'quote', 'notes': 'note', 'puzzles': 'puzzle' };

  try {
    await client.query("BEGIN");

    // ── 0. Consolidate plural → singular folder names ─────────────────────
    // Old code created attachments/quotes/, attachments/notes/, attachments/puzzles/.
    // Current code uses note_type directly: quote/, note/, puzzle/.
    // Move any files still in old plural folders and update DB references.
    let consolidated = 0;
    for (const [oldFolder, newFolder] of Object.entries(FOLDER_RENAMES)) {
      const oldDir = path.join(fileStorage.getAttachmentsDir(), oldFolder);
      const newDir = path.join(fileStorage.getAttachmentsDir(), newFolder);
      if (!fs.existsSync(oldDir)) continue;
      fs.mkdirSync(newDir, { recursive: true });

      // Find all DB refs pointing to the old folder
      const oldPrefix = `file:${oldFolder}/`;
      const newPrefix = `file:${newFolder}/`;
      const [naRefs, nRefs] = await Promise.all([
        client.query(
          `SELECT id, attachment_full FROM note_attachments WHERE attachment_full LIKE $1`,
          [`${oldPrefix}%`]
        ),
        client.query(
          `SELECT id, attachment_full FROM notes WHERE attachment_full LIKE $1`,
          [`${oldPrefix}%`]
        ),
      ]);

      for (const row of [...naRefs.rows, ...nRefs.rows]) {
        const newRef = row.attachment_full.replace(oldPrefix, newPrefix);
        const oldRelPath = row.attachment_full.replace(/^file:/, '').split(':')[0];
        const newRelPath = newRef.replace(/^file:/, '').split(':')[0];
        const oldFileFull = path.join(fileStorage.getAttachmentsDir(), oldRelPath);
        const newFileFull = path.join(fileStorage.getAttachmentsDir(), newRelPath);
        if (fs.existsSync(oldFileFull) && !fs.existsSync(newFileFull)) {
          fs.renameSync(oldFileFull, newFileFull);
        }
        const tbl = naRefs.rows.includes(row) ? 'note_attachments' : 'notes';
        await client.query(`UPDATE ${tbl} SET attachment_full = $1 WHERE id = $2`, [newRef, row.id]);
        consolidated++;
      }
    }

    // ── 1. Migrate note_attachments rows (base64 → disk) ──────────────────
    const naRows = await client.query(`
      SELECT na.id, na.note_id, na.position, na.attachment_full, na.attachment_type,
             n.note_type
      FROM note_attachments na
      JOIN notes n ON n.id = na.note_id
      WHERE na.attachment_full IS NOT NULL
        AND na.attachment_full NOT LIKE 'file:%'
        AND LENGTH(na.attachment_full) > 100
      ORDER BY na.note_id, na.position
    `);

    let migrated = 0, skipped = 0;

    for (const row of naRows.rows) {
      const raw = row.attachment_full;
      if (!raw || !raw.startsWith('data:')) { skipped++; continue; }

      const folder = row.note_type || 'note';
      const fileId = row.position === 0 ? `${row.note_id}` : `${row.note_id}_a${row.position}`;
      const newRef = fileStorage.processForStorage(raw, folder, fileId, '', 0, true);
      if (!newRef || !fileStorage.isFilePath(newRef)) { skipped++; continue; }

      await client.query(
        `UPDATE note_attachments SET attachment_full = $1 WHERE id = $2`,
        [newRef, row.id]
      );
      migrated++;
    }

    // ── 2. Migrate flat notes.attachment_full (no note_attachments row) ──
    const flatRows = await client.query(`
      SELECT n.id, n.note_type, n.attachment_full
      FROM notes n
      WHERE n.attachment_full IS NOT NULL
        AND n.attachment_full NOT LIKE 'file:%'
        AND LENGTH(n.attachment_full) > 100
        AND NOT EXISTS (
          SELECT 1 FROM note_attachments na
          WHERE na.note_id = n.id AND na.attachment_full = n.attachment_full
        )
    `);

    for (const row of flatRows.rows) {
      const raw = row.attachment_full;
      if (!raw || !raw.startsWith('data:')) { skipped++; continue; }

      const folder = row.note_type || 'note';
      const newRef = fileStorage.processForStorage(raw, folder, `${row.id}`, '', 0, true);
      if (!newRef || !fileStorage.isFilePath(newRef)) { skipped++; continue; }

      await client.query(
        `UPDATE notes SET attachment_full = $1 WHERE id = $2`,
        [newRef, row.id]
      );
      migrated++;
    }

    // ── 3. Fix stale file:.../tmp_... references ──────────────────────────
    // These are file: references where the tmp_ rename never completed.
    // Try to rename the tmp_ file on disk.
    // If the file is gone but notes.attachment_full already has a valid non-tmp
    // reference for the same note, use that instead of clearing to null.
    const tmpRefRows = await client.query(`
      SELECT 'na' AS tbl, na.id AS row_id, na.note_id, na.position,
             na.attachment_full, n.attachment_full AS notes_full, n.note_type
      FROM note_attachments na
      JOIN notes n ON n.id = na.note_id
      WHERE na.attachment_full LIKE 'file:%/tmp_%:%'
      UNION ALL
      SELECT 'note' AS tbl, n.id AS row_id, n.id AS note_id, -1 AS position,
             n.attachment_full, n.attachment_full AS notes_full, n.note_type
      FROM notes n
      WHERE n.attachment_full LIKE 'file:%/tmp_%:%'
    `);

    let fixed = 0, cleared = 0;
    for (const row of tmpRefRows.rows) {
      const { path: relPath, mimeType } = fileStorage.parseFilePath(row.attachment_full);
      const basename    = path.basename(relPath);
      const dir         = path.dirname(relPath);
      const ext         = path.extname(basename);
      const fileId      = row.position <= 0 ? `${row.note_id}` : `${row.note_id}_a${row.position}`;
      const newBasename = `${fileId}${ext}`;
      const newRelPath  = `${dir}/${newBasename}`;

      const oldFull = path.join(fileStorage.getAttachmentsDir(), relPath);
      const newFull = path.join(fileStorage.getAttachmentsDir(), newRelPath);

      let newRef = null;
      if (fs.existsSync(oldFull)) {
        if (fs.existsSync(newFull)) fs.unlinkSync(newFull);
        fs.renameSync(oldFull, newFull);
        newRef = fileStorage.createFileReference(newRelPath, mimeType);
        fixed++;
      } else if (row.tbl === 'na' && row.notes_full &&
                 fileStorage.isFilePath(row.notes_full) &&
                 !row.notes_full.includes('/tmp_')) {
        // Tmp file is gone, but notes.attachment_full already has the correct ref — use it
        newRef = row.notes_full;
        fixed++;
      } else {
        cleared++;
      }

      if (row.tbl === 'na') {
        await client.query(
          `UPDATE note_attachments SET attachment_full = $1 WHERE id = $2`,
          [newRef, row.row_id]
        );
      } else {
        await client.query(
          `UPDATE notes SET attachment_full = $1 WHERE id = $2`,
          [newRef, row.row_id]
        );
      }
    }

    // ── 4. Sync notes.attachment_full ↔ note_attachments (bidirectional) ──
    // Forward: note_attachments pos=0 → notes (when notes is empty/null)
    await client.query(`
      UPDATE notes n
      SET attachment_full = na.attachment_full,
          attachment_type  = na.attachment_type
      FROM note_attachments na
      WHERE na.note_id = n.id AND na.position = 0
        AND na.attachment_full LIKE 'file:%'
        AND (n.attachment_full IS NULL OR n.attachment_full = '' OR n.attachment_full NOT LIKE 'file:%')
    `);

    // Reverse: notes → note_attachments pos=0 (when note_attachments is empty/null)
    await client.query(`
      UPDATE note_attachments na
      SET attachment_full = n.attachment_full,
          attachment_type  = n.attachment_type
      FROM notes n
      WHERE na.note_id = n.id AND na.position = 0
        AND n.attachment_full LIKE 'file:%'
        AND (na.attachment_full IS NULL OR na.attachment_full = '')
    `);

    await client.query("COMMIT");
    res.json({ ok: true, migrated, consolidated, fixed, cleared, skipped });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============= PDF EXPORT =============

app.post("/api/export/pdf", async (req, res) => {
  try {
    const { quotes, filters, pdfColumns: rawPdfColumns } = req.body;
    const pdfColumns = rawPdfColumns === 2 ? 2 : 1;

    if (!quotes || quotes.length === 0) {
      return res.status(400).json({ error: "No quotes provided" });
    }


    // Import puppeteer
    const puppeteer = require("puppeteer");

    // Pre-resolve attachment thumbnails for PDF rendering (Puppeteer needs data URLs).
    for (const note of quotes) {
      if (!note) continue;
      if (note.note_type === 'tegneserie') {
        const big = await resolveImageForPdf(note.attachment_full, 1024);
        if (big) note.pdf_full_image = big;
      }
      await enrichNoteAttachmentsForPdf(note);
    }

    // Group quote notes by author for optional grouped layout; non-quotes stay flat.
    const groupedByAuthor = {};
    quotes.forEach((note) => {
      if (!note || note.note_type !== 'quote') return;

      const authorKey = note.author_name || 'Unknown Author';
      if (!groupedByAuthor[authorKey]) {
        groupedByAuthor[authorKey] = {
          authorName: authorKey,
          authorImage: note.author_image,
          sources: {},
        };
      }

      const sourceName = note.source_name && String(note.source_name).trim();
      const sourceKey = sourceName || '__no_source__';
      if (!groupedByAuthor[authorKey].sources[sourceKey]) {
        groupedByAuthor[authorKey].sources[sourceKey] = {
          sourceName: sourceName || '',
          sourceType: note.source_type || 'BOOK',
          sourceImage: note.source_image,
          quotes: [],
        };
      }

      groupedByAuthor[authorKey].sources[sourceKey].quotes.push(note);
    });

    // Generate HTML for PDF
    const html = generatePdfHtml(groupedByAuthor, filters, quotes, pdfColumns);

    // Launch puppeteer
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pageMargins = pdfColumns === 2
      ? { top: "12mm", right: "7mm", bottom: "12mm", left: "7mm" }
      : { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" };

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: pageMargins,
      printBackground: true,
    });

    await browser.close();

    // Send PDF with proper headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=quotes.pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer, "binary");
  } catch (error) {
    console.error("Error generating PDF:", error);
    res
      .status(500)
      .json({ error: "Failed to generate PDF", details: error.message });
  }
});

function shouldUseGroupedPdfLayout(allQuotes, filterNoteType) {
  if (!allQuotes || allQuotes.length === 0) return false;
  if (filterNoteType === 'quote') return true;
  // Mixed-type exports use flat layout so non-quotes are not lumped under Unknown Author.
  return allQuotes.every(q => q && q.note_type === 'quote');
}

function loadNoteTypesConfig() {
  try {
    const file = getSettingsFile();
    if (!fs.existsSync(file)) return [];
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(settings.noteTypes) ? settings.noteTypes : [];
  } catch (_) {
    return [];
  }
}

function getNoteTypeDisplayLabel(typeValue) {
  if (!typeValue) return '';
  const found = loadNoteTypesConfig().find(t => t.value === typeValue);
  return found ? found.label : typeValue;
}

function getPdfExportLabels(allQuotes, filterNoteType) {
  const types = [...new Set((allQuotes || []).map(q => q && q.note_type).filter(Boolean))];
  if (types.length === 1) {
    const label = getNoteTypeDisplayLabel(types[0]);
    return { titleLabel: label, typeLine: label };
  }
  if (types.length > 1) {
    const labels = types.map(t => getNoteTypeDisplayLabel(t)).join(', ');
    return { titleLabel: 'Mixed notes', typeLine: labels };
  }
  if (filterNoteType) {
    const label = getNoteTypeDisplayLabel(filterNoteType) || filterNoteType;
    return { titleLabel: label, typeLine: label };
  }
  return { titleLabel: 'Notes', typeLine: 'All visible note types' };
}

function loadTrainingTypesConfig() {
  try {
    const file = getSettingsFile();
    if (!fs.existsSync(file)) return [];
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(settings.trainingTypes) ? settings.trainingTypes : [];
  } catch (_) {
    return [];
  }
}

function generatePdfHtml(groupedByAuthor, filters, allQuotes, pdfColumns = 1) {
  const cols = pdfColumns === 2 ? 2 : 1;
  const filterNoteType = (filters && filters.noteTypeValue) || '';
  const useGroupedLayout = shouldUseGroupedPdfLayout(allQuotes, filterNoteType);
  const trainingTypes = loadTrainingTypesConfig();
  const { titleLabel, typeLine } = getPdfExportLabels(allQuotes, filterNoteType);
  const filterInfo = buildFilterInfoHtml(filters, typeLine);
  const bodyHtml = useGroupedLayout
    ? buildGroupedHtml(groupedByAuthor, cols, trainingTypes)
    : buildFlatHtml(allQuotes, filterNoteType, cols, trainingTypes);
  const twoColCss = cols === 2 ? `
    .notes-two-col {
      column-count: 2;
      column-gap: 32px;
    }
    .notes-two-col .note-card {
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
      display: inline-block;
      width: 100%;
      padding: 14px 0 16px;
      overflow: hidden;
    }
    .notes-two-col .tegneserie-img {
      max-width: 100%;
      max-height: 110mm;
    }
    .note-card-stacked {
      flex-direction: column;
      align-items: stretch;
      gap: 0;
    }
    .note-card-stacked .note-comment { margin-bottom: 6px; }
    .note-card-stacked .note-title {
      margin: 0 0 10px 0;
      padding-bottom: 0;
    }
    .note-card-stacked .pdf-att-col {
      width: 72px;
      max-width: 100%;
      margin: 0 0 12px 0;
    }
    .note-card-stacked .pdf-att-main img,
    .note-card-stacked .pdf-att-second img {
      width: 100%;
      max-width: 100%;
      height: auto;
      max-height: 72px;
      object-fit: cover;
    }
    .note-card-stacked .pdf-att-strip { width: 34px; }
    .note-card-stacked .pdf-att-strip img { max-height: 34px; }
    .note-card-stacked .note-text { margin-top: 0; }` : '';
  const coverPageHtml = `
    <section class="cover-page">
      <div class="cover-page-inner">
        <div class="page-header">
          <h1>📋 ${escapeHtml(titleLabel)}</h1>
        </div>
        ${filterInfo}
      </div>
    </section>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.45;
      color: #1f2937;
      font-size: 8.5pt;
      max-width: 100%;
    }
    h1 { color: #1f2937; font-size: 13pt; margin: 0 0 3px 0; font-family: 'Segoe UI', Arial, sans-serif; }
    h2 { color: #1f2937; font-size: 11pt; margin: 0 0 3px 0; font-family: 'Segoe UI', Arial, sans-serif; }
    h3 { color: #4b5563; font-size: 9.5pt;  margin: 0;        font-family: 'Segoe UI', Arial, sans-serif; }
    .cover-page {
      min-height: 250mm;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-after: always;
      break-after: page;
    }
    .cover-page-inner {
      width: 100%;
      max-width: 160mm;
    }
    .page-header {
      text-align: center;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1.5px solid #d1d5db;
    }
    .note-card {
      margin: 0;
      padding: 16px 0 12px;
      display: flex;
      gap: 9px;
      border-bottom: 1px solid #d1d5db;
    }
    .note-card-body { flex: 1; min-width: 0; }
    .note-comment {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 7pt;
      color: #6b7280;
      font-style: normal;
      margin: 0 0 5px 0;
      line-height: 1.35;
    }
    .note-training-meta {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 8.5pt;
      font-weight: 700;
      color: #b45309;
      margin: 0 0 8px 0;
      line-height: 1.3;
    }
    .pdf-att-col {
      flex-shrink: 0;
      width: 100px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pdf-att-main img,
    .pdf-att-second img,
    .pdf-att-strip img {
      width: 100%;
      height: auto;
      border-radius: 4px;
      display: block;
      object-fit: cover;
    }
    .pdf-att-main img { max-height: 120px; }
    .pdf-att-second img { max-height: 80px; }
    .pdf-att-row {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 4px;
    }
    .pdf-att-strip { width: 46px; flex-shrink: 0; }
    .pdf-att-strip img { max-height: 46px; }
    .pdf-att-file {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f3f4f6;
      border-radius: 4px;
      font-size: 13pt;
      min-height: 46px;
    }
    .note-title {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-weight: 700;
      font-size: 10pt;
      color: #1f2937;
      margin: 0 0 4px 0;
      line-height: 1.25;
    }
    .tegneserie-card {
      flex-direction: column;
      gap: 6px;
      align-items: stretch;
      break-inside: avoid;
      page-break-inside: avoid;
      padding-left: 0;
      padding-right: 0;
    }
    .tegneserie-card .note-title { font-size: 11pt; margin-bottom: 6px; }
    .tegneserie-img-wrap {
      text-align: center;
      margin: 2px 0;
    }
    .tegneserie-img {
      max-width: 100%;
      max-height: 180mm;
      height: auto;
      border-radius: 3px;
    }
    .note-text p        { margin: 0; line-height: 1.45; }
    .note-text p + p    { margin-top: 2px; }
    .note-text ul, .note-text ol { margin: 1px 0 1px 16px; padding: 0; }
    .note-text li       { margin: 0; }
    .note-text h1, .note-text h2, .note-text h3 { margin: 3px 0 1px 0; font-size: 8.5pt; }
    .note-text { font-style: italic; color: #1f2937; font-size: 8.5pt; }
    .note-meta  { margin-top: 3px; font-size: 7pt; color: #6b7280; font-family: 'Segoe UI', Arial, sans-serif; font-style: normal; }
    .author-section { margin-bottom: 18px; }
    .author-header {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 12px; padding-bottom: 6px;
      border-bottom: 1.5px solid #d1d5db;
    }
    .author-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
    .author-avatar-placeholder {
      width: 40px; height: 40px; border-radius: 50%;
      background: #e5e7eb;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .source-section { margin-bottom: 12px; margin-left: 10px; }
    .source-header  { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
    .source-cover   { width: 34px; height: 51px; object-fit: cover; border-radius: 2px; }
    .flat-group         { margin-bottom: 14px; }
    .flat-group-title   {
      font-size: 8.5pt; font-weight: 700; color: #374151;
      font-family: 'Segoe UI', Arial, sans-serif;
      padding: 0;
      margin-bottom: 5px;
    }
    .filter-info {
      background: #f3f4f6; padding: 6px 9px;
      border-radius: 4px; margin-bottom: 12px; font-size: 7.5pt;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    .filter-info h3 { font-size: 8pt; margin: 0 0 4px 0; color: #374151; }
    .filter-info p  { margin: 2px 0; }${twoColCss}
  </style>
</head>
<body>
  ${coverPageHtml}
  <main class="document-body pdf-cols-${cols}">
    ${bodyHtml}
  </main>
</body>
</html>`;
}

function buildFilterInfoHtml(filters, exportTypeLine) {
  const safeFilters = filters || {};
  const lines = [];
  const exportedType = exportTypeLine
    || safeFilters.noteType
    || 'All visible note types';
  lines.push(`<p><strong>Type:</strong> ${escapeHtml(exportedType)}</p>`);
  if (safeFilters.quote)  lines.push(`<p><strong>Text:</strong> ${escapeHtml(safeFilters.quote)}</p>`);
  if (safeFilters.author) lines.push(`<p><strong>Author:</strong> ${escapeHtml(safeFilters.author)}</p>`);
  if (safeFilters.source) lines.push(`<p><strong>Source:</strong> ${escapeHtml(safeFilters.source)}</p>`);
  if (safeFilters.tags)   lines.push(`<p><strong>Tags:</strong> ${escapeHtml(safeFilters.tags)}</p>`);
  if (!lines.length) return '';
  return `<div class="filter-info"><h3>Filters Applied:</h3>${lines.join('')}</div>`;
}

// Resolve an attachment value (file: ref or base64) to a data URL, resized so
// the longest side <= maxDim. Returns null if not an image or cannot be read.
async function resolveImageForPdf(attachmentValue, maxDim) {
  if (!attachmentValue) return null;
  try {
    const meta = fileStorage.retrieveFromStorage(attachmentValue, true);
    if (!meta || !meta.data) return null;
    if (!meta.mimeType || !meta.mimeType.startsWith('image/')) return null;

    // meta.data is "data:<mime>;base64,<payload>"
    const commaIdx = meta.data.indexOf(',');
    if (commaIdx === -1) return null;
    const payload = meta.data.slice(commaIdx + 1);
    const inputBuffer = Buffer.from(payload, 'base64');

    const sharp = require('sharp');
    const resized = await sharp(inputBuffer)
      .rotate()
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    return `data:image/jpeg;base64,${resized.toString('base64')}`;
  } catch (err) {
    console.warn('resolveImageForPdf failed:', err && err.message ? err.message : err);
    return null;
  }
}

function getNoteTitleForPdf(note) {
  const t = note.note_title && String(note.note_title).trim();
  if (!t || t.toLowerCase() === 'no title') return 'No title';
  return t;
}

function formatTrainingDateForPdf(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  return `${yyyy}.${mm}.${dd}  ${dayName}`;
}

function getTrainingTypeIconLabel(typeValue, trainingTypes) {
  if (!typeValue) return { icon: '🏋️', label: '' };
  const info = trainingTypes.find(t => t.value === typeValue);
  return {
    icon: info ? info.icon : '🏋️',
    label: info ? info.label : typeValue,
  };
}

function buildTrainingMetaHtml(note, trainingTypes) {
  if (!note || note.note_type !== 'training') return '';
  // API aliases notes.type as source_type in list/detail queries.
  const typeValue = note.source_type || note.type || '';
  const { icon, label } = getTrainingTypeIconLabel(typeValue, trainingTypes);
  const dateStr = formatTrainingDateForPdf(note.note_date);
  const trainingTypeStr = typeValue && typeValue !== 'ASSORTED' && label
    ? `${icon} ${label}`
    : '';

  let line = '';
  if (trainingTypeStr && dateStr) line = `${trainingTypeStr} — 📅 ${dateStr}`;
  else if (dateStr) line = `📅 ${dateStr}`;
  else if (trainingTypeStr) line = trainingTypeStr;
  if (!line) return '';
  return `<div class="note-training-meta">${escapeHtml(line)}</div>`;
}

function getNoteAttachmentsList(note) {
  if (note.pdf_attachments && note.pdf_attachments.length > 0) return note.pdf_attachments;
  if (note.attachments && note.attachments.length > 0) return note.attachments;
  if (note.thumbnail || note.attachment_full) {
    return [{
      thumbnail: note.thumbnail,
      attachment_full: note.attachment_full,
      attachment_type: note.attachment_type || 'image',
      pdf_thumb: note.thumbnail,
    }];
  }
  return [];
}

async function resolveAttachmentThumbForPdf(att, maxDim = 400) {
  if (att.pdf_thumb) return att.pdf_thumb;
  if (att.thumbnail && String(att.thumbnail).startsWith('data:image/')) return att.thumbnail;
  if (att.thumbnail) {
    const retrieved = fileStorage.retrieveFromStorage(att.thumbnail);
    if (retrieved && String(retrieved).startsWith('data:image/')) return retrieved;
  }
  const type = att.attachment_type || 'image';
  if (type === 'image' && att.attachment_full) {
    return await resolveImageForPdf(att.attachment_full, maxDim);
  }
  return null;
}

async function enrichNoteAttachmentsForPdf(note) {
  const list = getNoteAttachmentsList(note);
  for (let i = 0; i < list.length; i++) {
    const att = list[i];
    const maxDim = note.note_type === 'tegneserie' && i === 0 ? 1024 : 400;
    if (note.note_type === 'tegneserie' && i === 0 && note.pdf_full_image) {
      att.pdf_thumb = note.pdf_full_image;
    } else {
      att.pdf_thumb = await resolveAttachmentThumbForPdf(att, maxDim);
    }
  }
  note.pdf_attachments = list;
}

const PDF_ATT_ICONS = { pdf: '📄', video: '🎬', document: '📎', encrypted: '🔒', audio: '🎵' };

function buildNoteCommentHtml(note) {
  const comment = note.comment && String(note.comment).trim();
  if (!comment) return '';
  return `<div class="note-comment">${escapeHtml(comment)}</div>`;
}

function buildPdfAttachmentThumbHtml(att, className) {
  if (att.pdf_thumb) {
    return `<div class="${className}"><img src="${att.pdf_thumb}" alt=""></div>`;
  }
  const type = att.attachment_type || 'document';
  const icon = PDF_ATT_ICONS[type] || '📎';
  return `<div class="${className} pdf-att-file"><span>${icon}</span></div>`;
}

function buildPdfAttachmentColumnHtml(note, attachmentsOverride = null) {
  const attachments = attachmentsOverride || getNoteAttachmentsList(note);
  if (attachments.length === 0) return '';

  const mainHtml = buildPdfAttachmentThumbHtml(attachments[0], 'pdf-att-main');
  const secondHtml = attachments.length > 1
    ? buildPdfAttachmentThumbHtml(attachments[1], 'pdf-att-second')
    : '';
  const rest = attachments.slice(2);
  const restHtml = rest.length > 0
    ? `<div class="pdf-att-row">${rest.map(a => buildPdfAttachmentThumbHtml(a, 'pdf-att-strip')).join('')}</div>`
    : '';

  return `<div class="pdf-att-col">${mainHtml}${secondHtml}${restHtml}</div>`;
}

function buildNoteCardHtml(note, pdfColumns = 1, trainingTypes = []) {
  const stacked = pdfColumns === 2;
  const trainingMetaHtml = buildTrainingMetaHtml(note, trainingTypes);
  const commentHtml = buildNoteCommentHtml(note);
  const titleHtml = `<div class="note-title">${escapeHtml(getNoteTitleForPdf(note))}</div>`;
  const tagsHtml = note.tags
    ? `<div class="note-meta">🏷 ${escapeHtml(note.tags)}</div>` : '';
  const textHtml = `<div class="note-text">${note.note_text || ''}</div>`;
  const stackedClass = stacked ? ' note-card-stacked' : '';

  // Tegneserie: full-width image, title above, text AFTER the image (if any).
  if (note.note_type === 'tegneserie') {
    const bigImg = note.pdf_full_image || note.thumbnail || note.attachment_full;
    const imgHtml = bigImg
      ? `<div class="tegneserie-img-wrap"><img src="${bigImg}" class="tegneserie-img"></div>`
      : '';
    const extraAttachments = getNoteAttachmentsList(note).slice(1);
    const extraAttHtml = extraAttachments.length > 0
      ? buildPdfAttachmentColumnHtml(note, extraAttachments)
      : '';
    return `
      <div class="note-card tegneserie-card${stackedClass}">
        ${commentHtml}
        ${titleHtml}
        ${imgHtml}
        ${extraAttHtml}
        ${note.note_text ? textHtml : ''}
        ${tagsHtml}
      </div>`;
  }

  const attColHtml = buildPdfAttachmentColumnHtml(note);

  if (stacked) {
    return `
      <div class="note-card note-card-stacked">
        ${trainingMetaHtml}
        ${commentHtml}
        ${titleHtml}
        ${attColHtml}
        ${textHtml}
        ${tagsHtml}
      </div>`;
  }

  // Single-column: attachment column on the left, comment/title/text on the right.
  return `
    <div class="note-card">
      ${attColHtml}
      <div class="note-card-body">
        ${trainingMetaHtml}
        ${commentHtml}
        ${titleHtml}
        ${textHtml}
        ${tagsHtml}
      </div>
    </div>`;
}

function wrapNotesPdfLayout(notesHtml, pdfColumns) {
  if (!notesHtml) return '';
  if (pdfColumns === 2) return `<div class="notes-two-col">${notesHtml}</div>`;
  return `<div class="notes-one-col">${notesHtml}</div>`;
}

function buildGroupedHtml(groupedByAuthor, pdfColumns = 1, trainingTypes = []) {
  const typeIcon = { BOOK: '📖', MOVIE: '🎬', ASSORTED: '📝' };
  let html = '';
  Object.values(groupedByAuthor).forEach((author) => {
    const avatarHtml = author.authorImage
      ? `<img src="${author.authorImage}" class="author-avatar">`
      : `<div class="author-avatar-placeholder">✍️</div>`;
    html += `<div class="author-section">
      <div class="author-header">
        ${avatarHtml}
        <h2>${escapeHtml(author.authorName)}</h2>
      </div>`;
    Object.values(author.sources).forEach(source => {
      const hasSourceName = !!(source.sourceName && String(source.sourceName).trim());
      const noteCards = source.quotes
        .map(note => buildNoteCardHtml(note, pdfColumns, trainingTypes))
        .join('');
      if (hasSourceName) {
        const coverHtml = source.sourceImage
          ? `<img src="${source.sourceImage}" class="source-cover">` : '';
        html += `<div class="source-section">
          <div class="source-header">
            ${coverHtml}
            <h3>${typeIcon[source.sourceType] || '📝'} ${escapeHtml(source.sourceName)}</h3>
          </div>`;
      }
      html += wrapNotesPdfLayout(noteCards, pdfColumns);
      if (hasSourceName) html += `</div>`;
    });
    html += `</div>`;
  });
  return html;
}

function buildFlatHtml(allQuotes, noteType, pdfColumns = 1, trainingTypes = []) {
  if (!allQuotes || allQuotes.length === 0) return '';

  // For tegneserie, group by sub-type (note.type), e.g. PONDUS / DILBERT / NEMI.
  // A "Month Year" created_at header doesn't make sense for archived comics.
  const allTegneserie = allQuotes.every(q => q && q.note_type === 'tegneserie');
  if (allTegneserie) {
    const byType = {};
    allQuotes.forEach(note => {
      const key = (note.type && String(note.type).trim()) || 'Uncategorized';
      if (!byType[key]) byType[key] = [];
      byType[key].push(note);
    });
    const sortedKeys = Object.keys(byType).sort((a, b) => a.localeCompare(b));
    let html = '';
    sortedKeys.forEach(key => {
      const noteCards = byType[key]
        .map(note => buildNoteCardHtml(note, pdfColumns, trainingTypes))
        .join('');
      html += `<div class="flat-group">
        <div class="flat-group-title">💥 ${escapeHtml(key)}</div>`;
      html += wrapNotesPdfLayout(noteCards, pdfColumns);
      html += `</div>`;
    });
    return html;
  }

  const noteCards = allQuotes
    .map(note => buildNoteCardHtml(note, pdfColumns, trainingTypes))
    .join('');
  return wrapNotesPdfLayout(noteCards, pdfColumns);
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start server
async function startServer() {
  try {
    // Run migrations on startup
    console.log('🔄 Running database migrations...');
    const { runMigrations } = require('../migrations/run-migrations');
    await runMigrations();
    console.log('✅ Migrations completed\n');
    
    // Start the server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Local: http://localhost:${PORT}`);
      console.log(`Network: http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Keep the server alive — log unhandled errors instead of crashing
process.on('uncaughtException', (err) => {
  console.error('🔴 Uncaught Exception (server kept alive):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('🔴 Unhandled Rejection (server kept alive):', reason);
});
