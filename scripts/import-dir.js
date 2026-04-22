#!/usr/bin/env node
/**
 * import-dir.js
 *
 * Creates a notes import JSON file (same format as parse-enex.js output)
 * from every file in a given directory — one note per file, each file
 * becomes the note's attachment.
 *
 * Usage:
 *   node scripts/import-dir.js <directory> [output] [note_type] [sub_type] [tag ...] [--flags]
 *
 * Parameters:
 *   directory   - path to the folder whose files to import
 *   output      - output JSON path  (default: <dir-name>-import.json)
 *   note_type   - lowercase note type: quote  training  note  tegneserie …  (default: tegneserie)
 *   sub_type    - sub-type value as configured in settings.json  (omit if none)
 *   tag ...     - zero or more tags applied to ALL notes
 *
 * Named flags:
 *   --split-mb=N    split output into files ≤ N MB each         (default: 30)
 *   --recursive     also descend into sub-directories
 *   --title-from=name|stem   use full filename or stem (no ext) as note_title (default: stem)
 *
 * Examples:
 *   node scripts/import-dir.js ~/Desktop/comics tegneserie-import.json tegneserie
 *   node scripts/import-dir.js ./photos out.json note archiv 2024
 *   node scripts/import-dir.js ./scans   out.json tegneserie ASSORTED archiv --split-mb=20
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

const THUMBNAIL_MAX_PX = 240;

// ─── Thumbnail ──────────────────────────────────────────────────────────────

async function generateThumbnail(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl;
  try {
    const comma = dataUrl.indexOf(',');
    const input = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    const meta  = await sharp(input).metadata();
    const longest = Math.max(meta.width || 0, meta.height || 0);
    if (longest <= THUMBNAIL_MAX_PX) return dataUrl;
    const out = await sharp(input)
      .resize(THUMBNAIL_MAX_PX, THUMBNAIL_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch (err) {
    process.stdout.write(`\n⚠️  Thumbnail generation failed: ${err.message}\n`);
    return dataUrl;
  }
}

// ─── Vault path resolver ────────────────────────────────────────────────────

function resolveVaultPath() {
  try {
    const localJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'config', 'local.json'), 'utf-8')
    );
    if (localJson.vaultPath) return localJson.vaultPath;
  } catch (e) { /* local.json missing */ }
  // Fallback: attachments/ inside the repo
  return path.join(__dirname, '..', 'attachments');
}

// ─── Settings helpers (same as parse-enex.js) ───────────────────────────────

function resolveSettingsPath() {
  try {
    const localJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'config', 'local.json'), 'utf-8')
    );
    if (localJson.vaultPath) {
      const vaultSettings = path.join(localJson.vaultPath, 'config', 'settings.json');
      if (fs.existsSync(vaultSettings)) return vaultSettings;
    }
  } catch (e) { /* local.json missing or unreadable */ }
  return path.join(__dirname, '..', 'config', 'settings.json');
}

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(resolveSettingsPath(), 'utf-8')); }
  catch (e) { return null; }
}

function loadNoteTypes() {
  const s = loadSettings();
  if (s && Array.isArray(s.noteTypes)) return s.noteTypes.map(t => t.value.toLowerCase());
  return ['quote', 'note', 'training', 'tegneserie', 'puzzle'];
}

function loadSubTypesForNoteType(noteType) {
  const s = loadSettings();
  if (s && Array.isArray(s.noteTypes)) {
    const nt = s.noteTypes.find(t => t.value.toLowerCase() === noteType.toLowerCase());
    if (nt && Array.isArray(nt.subTypes)) return nt.subTypes.map(t => t.value.toUpperCase());
  }
  if (noteType === 'training') return ['WEIGHTS', 'CARDIO', 'MIX', 'HOME', 'OVERVIEW/DOC'];
  if (noteType === 'quote')    return ['BOOK', 'MOVIE-TV', 'POETRY', 'LYRICS', 'JOKES', 'ASSORTED'];
  return [];
}

// ─── MIME type detection ────────────────────────────────────────────────────

const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif',  webp: 'image/webp', bmp: 'image/bmp',
  svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mkv: 'video/x-matroska', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain',
};

function getMimeType(filename) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return EXT_MIME[ext] || 'application/octet-stream';
}

function getAttachmentType(mimeType) {
  if (mimeType.startsWith('image/'))  return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('video/'))  return 'video';
  if (mimeType.startsWith('audio/'))  return 'audio';
  return 'document';
}

// ─── File discovery ─────────────────────────────────────────────────────────

const SKIP_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function collectFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
    if (entry.isFile()) results.push(path.join(dir, entry.name));
  }
  return results.sort();
}

// ─── Batch writer (same logic as parse-enex.js) ─────────────────────────────

function makeBatchWriter(baseOutputPath, splitBytes) {
  const outputFiles = [];
  let batchNum = 0;
  let currentBatch = [];
  let currentBatchBytes = 0;

  const flushBatch = () => {
    if (currentBatch.length === 0) return;
    batchNum++;
    const batchPath = `${baseOutputPath}-part${batchNum}.json`;
    const importData = {
      data:   { quotes: currentBatch, authors: [], sources: [], tags: [] },
      counts: { quotes: currentBatch.length, authors: 0, sources: 0, tags: 0 }
    };
    fs.writeFileSync(batchPath, JSON.stringify(importData, null, 2), 'utf-8');
    const mb = (fs.statSync(batchPath).size / (1024 * 1024)).toFixed(2);
    process.stdout.write(`\n💾 Part ${batchNum}: ${currentBatch.length} notes → ${batchPath}  (${mb} MB)\n`);
    outputFiles.push(batchPath);
    currentBatch = [];
    currentBatchBytes = 0;
  };

  const addNote = (note) => {
    const noteBytes = Buffer.byteLength(JSON.stringify(note), 'utf8');
    if (noteBytes >= splitBytes) {
      if (currentBatch.length > 0) flushBatch();
      process.stdout.write(`\n⚠️  Oversized note (${(noteBytes / 1048576).toFixed(1)} MB) — placed in its own file\n`);
      currentBatch = [note];
      currentBatchBytes = noteBytes;
      flushBatch();
      return;
    }
    if (currentBatch.length > 0 && currentBatchBytes + noteBytes > splitBytes) flushBatch();
    currentBatch.push(note);
    currentBatchBytes += noteBytes;
  };

  return { addNote, flushBatch, outputFiles };
}

// ─── Argument parser (same as parse-enex.js) ────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    const m = arg.match(/^--([a-z-]+)(?:=(.+))?$/);
    if (m) { flags[m[1]] = m[2] !== undefined ? m[2] : true; }
    else positional.push(arg);
  }
  return { positional, flags };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { positional: args, flags } = parseArgs(process.argv.slice(2));

  const DEFAULT_SPLIT_MB = 30;
  const DEFAULT_NOTE_TYPE = 'tegneserie';

  if (args.length === 0) {
    console.log('Usage: node scripts/import-dir.js <directory> [output] [note_type] [sub_type] [tag ...] [--flags]');
    console.log('');
    console.log('Positional:');
    console.log('  directory    folder whose files to import (one note per file)');
    console.log('  output       output JSON path  (default: <dir-name>-import.json)');
    console.log(`  note_type    lowercase note type  (default: ${DEFAULT_NOTE_TYPE})`);
    console.log('  sub_type     sub-type value from settings (omit if not applicable)');
    console.log('  tag ...      zero or more tags applied to all notes');
    console.log('');
  console.log('Named flags:');
  console.log(`  --split-mb=N     split output at N MB per file  (default: ${DEFAULT_SPLIT_MB})`);
  console.log('  --vault-copy     copy files directly to vault folder and use file: references');
  console.log('                   (recommended for large files — keeps the JSON small)');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/import-dir.js ~/Desktop/comics out.json tegneserie');
  console.log('  node scripts/import-dir.js ./photos photos.json note archiv 2024');
  console.log('  node scripts/import-dir.js ./scans out.json tegneserie ASSORTED archiv --split-mb=20');
  console.log('  node scripts/import-dir.js ./bigpics out.json tegneserie --vault-copy');
    process.exit(1);
  }

  const dirArg      = args[0];
  const dirPath     = path.resolve(dirArg);

  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    console.error(`❌ Not a directory: ${dirPath}`);
    process.exit(1);
  }

  const dirName     = path.basename(dirPath);
  const outputPath  = args[1] || `${dirName}-import.json`;
  const noteTypeArg = args[2] || DEFAULT_NOTE_TYPE;

  const validNoteTypes = loadNoteTypes();
  if (!validNoteTypes.includes(noteTypeArg.toLowerCase())) {
    console.error(`❌ Unknown note type: "${noteTypeArg}"`);
    console.error(`   Valid types: ${validNoteTypes.join(', ')}`);
    process.exit(1);
  }

  const validSubTypes = loadSubTypesForNoteType(noteTypeArg);
  const hasSubTypes   = validSubTypes.length > 0;
  const subTypeArg    = hasSubTypes ? (args[3] || null) : null;
  const extraTags     = hasSubTypes ? args.slice(4) : args.slice(3);

  if (subTypeArg && validSubTypes.length > 0 && !validSubTypes.includes(subTypeArg.toUpperCase())) {
    console.error(`❌ Unknown sub-type for "${noteTypeArg}": "${subTypeArg.toUpperCase()}"`);
    console.error(`   Valid sub-types: ${validSubTypes.join(', ')}`);
    process.exit(1);
  }

  const noteType   = noteTypeArg.toLowerCase();
  const subType    = subTypeArg ? subTypeArg.toUpperCase() : null;
  const splitMB    = flags['split-mb'] ? parseFloat(flags['split-mb']) : DEFAULT_SPLIT_MB;
  const splitBytes = splitMB * 1024 * 1024;
  const vaultCopy  = !!flags['vault-copy'];

  const baseOutputPath = outputPath.replace(/\.json$/, '');
  const tagObjects = extraTags.map(t => ({ name: t, type: noteType }));

  console.log(`📂 Directory : ${dirPath}`);
  console.log(`📋 Note type : ${noteType}${subType ? `  /  Sub-type: ${subType}` : ''}`);
  if (extraTags.length) console.log(`🏷️  Tags      : ${extraTags.join(', ')}`);
  if (vaultCopy)        console.log(`💾 Mode      : --vault-copy (files copied to vault, file: references)`);
  console.log('');

  // Prepare vault attachments folder if vault-copy mode
  let vaultAttachDir = null;
  if (vaultCopy) {
    const vaultPath = resolveVaultPath();
    vaultAttachDir  = path.join(vaultPath, 'attachments', noteType);
    fs.mkdirSync(vaultAttachDir, { recursive: true });
  }

  const files = collectFiles(dirPath);
  if (files.length === 0) {
    console.error('❌ No files found in directory.');
    process.exit(1);
  }
  console.log(`Found ${files.length} file(s)\n`);

  const { addNote, flushBatch, outputFiles } = makeBatchWriter(baseOutputPath, splitBytes);

  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const filename = path.basename(filePath);

    process.stdout.write(`\r   [${i + 1}/${files.length}] ${filename.substring(0, 50).padEnd(50)}`);

    let fileData;
    try {
      fileData = fs.readFileSync(filePath);
    } catch (err) {
      process.stdout.write(`\n⚠️  Skipping (read error): ${filename} — ${err.message}\n`);
      skipped++;
      continue;
    }

    const mimeType      = getMimeType(filename);
    const attachType    = getAttachmentType(mimeType);
    const sizeMB        = (fileData.length / (1024 * 1024)).toFixed(2);

    let attachmentFull;
    let storageType;

    if (vaultCopy) {
      // Copy the file into the vault attachments folder and write a relative file: reference.
      // Format expected by the app: file:<relPath>:<mimeType>
      // where relPath is relative to <vault>/attachments/.
      // The import endpoint leaves non-tmp_ file: refs as-is (no rename needed).
      let destName = filename;
      let destPath = path.join(vaultAttachDir, destName);
      let counter  = 1;
      while (fs.existsSync(destPath)) {
        const ext  = path.extname(filename);
        const stem = path.basename(filename, ext);
        destName   = `${stem}_${counter++}${ext}`;
        destPath   = path.join(vaultAttachDir, destName);
      }
      fs.copyFileSync(filePath, destPath);
      // Relative path within <vault>/attachments/
      const relPath = path.join(noteType, destName).replace(/\\/g, '/');
      attachmentFull = `file:${relPath}:${mimeType}`;
      storageType    = 'file';
    } else {
      attachmentFull = `data:${mimeType};base64,${fileData.toString('base64')}`;
      storageType    = 'base64';
    }

    const thumb = attachType === 'image' ? await generateThumbnail(
      vaultCopy ? `data:${mimeType};base64,${fileData.toString('base64')}` : attachmentFull
    ) : null;

    const attachment = {
      position:        0,
      thumbnail:       thumb,
      attachment_full: attachmentFull,
      attachment_type: attachType,
      filename,
    };

    const note = {
      note_text:    '',
      note_title:   null,
      note_type:    noteType,
      type:         subType,
      comment:      null,
      author_name:  null,
      source_name:  null,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
      thumbnail:    thumb,
      attachment_full:  attachmentFull,
      storage_type:     storageType,
      attachment_type:  attachType,
      attachments:  [attachment],
      ...(tagObjects.length > 0 ? { tag_objects: tagObjects } : {}),
    };

    addNote(note);
    processed++;
  }

  flushBatch();
  process.stdout.write('\n');

  console.log(`\n📊 Summary:`);
  console.log(`   Files found  : ${files.length}`);
  console.log(`   Imported     : ${processed}`);
  if (skipped) console.log(`   Skipped      : ${skipped}`);

  if (processed === 0) {
    console.error('❌ No notes were created.');
    process.exit(1);
  }

  // If only one part, rename to exact requested path
  if (outputFiles.length === 1 && outputFiles[0] !== outputPath) {
    fs.renameSync(outputFiles[0], outputPath);
    outputFiles[0] = outputPath;
    const mb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
    console.log(`\n✅ Created: ${outputPath}  (${mb} MB)`);
  } else {
    console.log(`\n✅ Done — ${processed} notes across ${outputFiles.length} files`);
    console.log(`\n📋 Import each file via "Import Notes" (📥) in the app:`);
    outputFiles.forEach((f, idx) => console.log(`   ${idx + 1}. ${f}`));
  }

  console.log(`\n📋 Next steps:`);
  console.log(`   1. Open the app in the browser`);
  console.log(`   2. Click "Import Notes" (📥) in the left menu`);
  console.log(`   3. Select the output file(s) above`);
  if (vaultCopy) {
    console.log(`\n   ℹ️  Files were copied to: ${vaultAttachDir}`);
    console.log(`   The JSON only contains file: references — import is fast even for large files.`);
  }
  console.log(`\n   All notes → ${noteType}${subType ? ` / ${subType}` : ''}`);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
