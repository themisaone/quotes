/**
 * Migrate Thumbnails — downscale all oversized thumbnails to 240 px (longest side)
 *
 * Two cases handled:
 *   1. thumbnail = data:image/... (base64 in DB)
 *      → If already ≤ 240 px on longest side: SKIP (already correct)
 *      → If larger: downscale with sharp, write new base64 back to DB
 *
 *   2. thumbnail = file:path:mime  (large file on disk from ENEX import)
 *      → Load file, downscale to 240 px, store as base64 in DB
 *      → Print note ID + file path so you can delete the now-redundant thumbnail file
 *
 * attachment_full is NOT touched — it stays as the full-res version.
 *
 * Usage:
 *   node scripts/migrate-thumbnails.js              (dry-run: shows what would change)
 *   node scripts/migrate-thumbnails.js --apply      (actually updates the DB)
 *   node scripts/migrate-thumbnails.js --apply --note-type=historical
 */

'use strict';

const { Pool }  = require('pg');
const sharp     = require('sharp');
const fs        = require('fs');
const path      = require('path');
require('dotenv').config();

const ATTACHMENTS_DIR = path.join(__dirname, '../attachments');
const THUMBNAIL_MAX_PX = 240;

// ── CLI args ─────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = !args.includes('--apply');
const TYPE_FILTER = (args.find(a => a.startsWith('--note-type=')) || '').replace('--note-type=', '') || null;

// ── DB pool ───────────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function isBase64(value) {
  return value && value.startsWith('data:');
}

function isFileRef(value) {
  return value && value.startsWith('file:');
}

/** Parse "file:quotes/123.jpg:image/jpeg" → { filePath, mimeType } */
function parseFileRef(value) {
  const parts = value.split(':');
  return { filePath: parts[1], mimeType: parts[2] || 'application/octet-stream' };
}

/** base64 data-URL → Buffer of raw bytes */
function base64ToBuffer(dataUrl) {
  const comma = dataUrl.indexOf(',');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

/** Buffer + mimeType → data-URL base64 string */
function bufferToBase64(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Downscale an image buffer to max THUMBNAIL_MAX_PX on longest side.
 * Returns { buffer, width, height, mimeType, alreadySmall }
 */
async function downscaleTo240(inputBuffer) {
  const meta = await sharp(inputBuffer).metadata();
  const longest = Math.max(meta.width || 0, meta.height || 0);

  if (longest <= THUMBNAIL_MAX_PX) {
    return { buffer: inputBuffer, width: meta.width, height: meta.height,
             mimeType: `image/${meta.format}`, alreadySmall: true };
  }

  // Fit inside 240×240, keeping aspect ratio, output as JPEG for size
  const outBuffer = await sharp(inputBuffer)
    .resize(THUMBNAIL_MAX_PX, THUMBNAIL_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const outMeta = await sharp(outBuffer).metadata();
  return {
    buffer: outBuffer,
    width: outMeta.width,
    height: outMeta.height,
    mimeType: 'image/jpeg',
    alreadySmall: false,
    originalSize: inputBuffer.length,
    newSize: outBuffer.length
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('🖼️  Thumbnail migration');
  console.log(`   Mode      : ${DRY_RUN ? '🔍 DRY RUN (no DB changes)' : '✍️  APPLY'}`);
  if (TYPE_FILTER) console.log(`   Note type : ${TYPE_FILTER}`);
  console.log('');

  // Fetch notes that have a thumbnail
  let query = `SELECT id, note_type, thumbnail FROM notes WHERE thumbnail IS NOT NULL AND thumbnail != ''`;
  const params = [];
  if (TYPE_FILTER) {
    query += ` AND note_type = $1`;
    params.push(TYPE_FILTER);
  }
  query += ` ORDER BY id`;

  const { rows } = await pool.query(query, params);
  console.log(`📋 Notes with thumbnail: ${rows.length}\n`);

  const stats = {
    total:        rows.length,
    skippedSmall: 0,
    skippedNonImage: 0,
    downscaled:   0,
    fileToBase64: 0,
    errors:       0
  };

  const filesToDelete = [];  // file refs that can be removed after migration

  for (let i = 0; i < rows.length; i++) {
    const note = rows[i];
    const pct  = (((i + 1) / rows.length) * 100).toFixed(0);
    process.stdout.write(`\r   Progress: ${pct}%  |  Note ${note.id}          `);

    try {
      let inputBuffer;
      let sourceLabel;
      let isFromFile = false;
      let originalFilePath;

      if (isBase64(note.thumbnail)) {
        // ── Case 1: base64 in DB ──────────────────────────────────────────────
        if (!note.thumbnail.startsWith('data:image/')) {
          // Non-image (PDF icon etc.) — skip
          stats.skippedNonImage++;
          continue;
        }
        inputBuffer = base64ToBuffer(note.thumbnail);
        sourceLabel = `base64 (${(inputBuffer.length / 1024).toFixed(0)} KB)`;

      } else if (isFileRef(note.thumbnail)) {
        // ── Case 2: file reference ────────────────────────────────────────────
        const { filePath } = parseFileRef(note.thumbnail);
        const absPath = path.join(ATTACHMENTS_DIR, filePath);

        if (!fs.existsSync(absPath)) {
          process.stdout.write(`\n⚠️  Note ${note.id}: file not found: ${filePath}\n`);
          stats.errors++;
          continue;
        }

        inputBuffer = fs.readFileSync(absPath);
        sourceLabel = `file (${(inputBuffer.length / 1024 / 1024).toFixed(2)} MB) → ${filePath}`;
        isFromFile = true;
        originalFilePath = filePath;

      } else {
        stats.skippedNonImage++;
        continue;
      }

      // Downscale (or detect already small)
      const result = await downscaleTo240(inputBuffer);

      if (result.alreadySmall && !isFromFile) {
        // Already correct size, no file to clean up — skip
        stats.skippedSmall++;
        continue;
      }

      const newBase64 = bufferToBase64(result.buffer, result.mimeType);

      if (result.alreadySmall && isFromFile) {
        // File was already small — still move to base64 in DB (no resize needed)
        process.stdout.write(`\n📌 Note ${note.id} [${note.note_type}]: file already ≤ 240px → moved to DB as base64\n`);
      } else {
        const savedKB = result.originalSize
          ? `${(result.originalSize / 1024).toFixed(0)} KB → ${(result.newSize / 1024).toFixed(0)} KB`
          : `→ ${(result.buffer.length / 1024).toFixed(0)} KB`;
        process.stdout.write(`\n✅ Note ${note.id} [${note.note_type}]: ${result.width}×${result.height}px  ${savedKB}  (${sourceLabel})\n`);
      }

      if (!DRY_RUN) {
        await pool.query('UPDATE notes SET thumbnail = $1 WHERE id = $2', [newBase64, note.id]);
      }

      if (isFromFile) {
        filesToDelete.push({ noteId: note.id, filePath: originalFilePath });
        stats.fileToBase64++;
      } else {
        stats.downscaled++;
      }

    } catch (err) {
      process.stdout.write(`\n❌ Note ${note.id}: ${err.message}\n`);
      stats.errors++;
    }
  }

  process.stdout.write('\n');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n📊 Summary:');
  console.log(`   Total notes examined : ${stats.total}`);
  console.log(`   Already ≤ 240px      : ${stats.skippedSmall}`);
  console.log(`   Skipped (non-image)  : ${stats.skippedNonImage}`);
  console.log(`   Downscaled (base64)  : ${stats.downscaled}`);
  console.log(`   File → base64 in DB  : ${stats.fileToBase64}`);
  console.log(`   Errors               : ${stats.errors}`);

  if (filesToDelete.length > 0) {
    console.log(`\n🗑️  Thumbnail files now redundant — safe to delete:`);
    filesToDelete.forEach(({ noteId, filePath }) => {
      console.log(`   Note ${noteId}: attachments/${filePath}`);
    });
    if (DRY_RUN) {
      console.log('\n   (dry-run: no files deleted)');
    } else {
      console.log('\n   Run the following to delete them:');
      filesToDelete.forEach(({ filePath }) => {
        console.log(`   rm attachments/${filePath}`);
      });
    }
  }

  if (DRY_RUN && (stats.downscaled + stats.fileToBase64 > 0)) {
    console.log('\n💡 Re-run with --apply to make changes:');
    console.log(`   node scripts/migrate-thumbnails.js --apply${TYPE_FILTER ? ` --note-type=${TYPE_FILTER}` : ''}`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
