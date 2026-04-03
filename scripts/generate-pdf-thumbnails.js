/**
 * generate-pdf-thumbnails.js
 *
 * Backfill thumbnails for PDF attachments (both file-on-disk and base64-in-DB)
 * that have no thumbnail yet, or only a small icon placeholder (< ICON_THUMB_MAX bytes).
 * Uses Ghostscript (gs) to render page 1 as a JPEG.
 *
 * Usage:
 *   node scripts/generate-pdf-thumbnails.js [--dry-run] [--limit N]
 *
 * Options:
 *   --dry-run   List affected rows without writing to DB
 *   --limit N   Process at most N rows (default: all)
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const pool = require('../src/db.js');
const fileStorage = require('../src/fileStorage.js');

const JPEG_QUALITY    = 82;
const ICON_THUMB_MAX  = 15000; // thumbnails smaller than this are icon placeholders, not page renders

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT   = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : Infinity;

// ── helpers ────────────────────────────────────────────────────────────────

function parseFileRef(ref) {
  if (!ref || !ref.startsWith('file:')) return null;
  const without = ref.slice(5);
  const lastColon = without.lastIndexOf(':');
  if (lastColon === -1) return { relPath: without, mime: 'application/pdf' };
  return { relPath: without.slice(0, lastColon), mime: without.slice(lastColon + 1) };
}

function generateThumbnailFromFile(pdfPath) {
  const tmpOut = path.join(os.tmpdir(), `pdf_thumb_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  try {
    execSync(
      `gs -q -dNOPAUSE -dBATCH -dSAFER \
        -sDEVICE=jpeg \
        -dFirstPage=1 -dLastPage=1 \
        -r36 \
        -dJPEGQ=${JPEG_QUALITY} \
        -sOutputFile=${tmpOut} \
        ${pdfPath}`,
      { timeout: 30000, stdio: 'pipe' }
    );
    if (!fs.existsSync(tmpOut)) return null;
    const jpegBuf = fs.readFileSync(tmpOut);
    return `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
  } catch (e) {
    console.error(`  ✗ gs failed: ${e.message.split('\n')[0]}`);
    return null;
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
}

function generateThumbnailFromBase64(base64Data) {
  // base64Data may be "data:application/pdf;base64,..." or raw base64
  let raw = base64Data;
  if (raw.includes(',')) raw = raw.split(',')[1];

  const tmpPdf = path.join(os.tmpdir(), `pdf_in_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  try {
    fs.writeFileSync(tmpPdf, Buffer.from(raw, 'base64'));
    return generateThumbnailFromFile(tmpPdf);
  } finally {
    if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
  }
}

function needsThumbnail(thumbnail) {
  if (!thumbnail) return true;
  if (thumbnail.length < ICON_THUMB_MAX) return true; // small icon placeholder
  return false;
}

// ── main ───────────────────────────────────────────────────────────────────

(async () => {
  try {
    // --- File-on-disk PDFs (missing or icon thumbnail) ---
    const fileRows = await pool.query(`
      SELECT id, 'notes' AS tbl, id AS note_id, attachment_full, thumbnail
      FROM notes
      WHERE attachment_type = 'pdf'
        AND attachment_full LIKE 'file:%'
        AND (thumbnail IS NULL OR thumbnail = '' OR LENGTH(thumbnail) < ${ICON_THUMB_MAX})
      UNION ALL
      SELECT id, 'note_attachments' AS tbl, note_id, attachment_full, thumbnail
      FROM note_attachments
      WHERE attachment_type = 'pdf'
        AND attachment_full LIKE 'file:%'
        AND (thumbnail IS NULL OR thumbnail = '' OR LENGTH(thumbnail) < ${ICON_THUMB_MAX})
      ORDER BY note_id, id
    `);

    // --- DB-stored PDFs (missing or icon thumbnail) ---
    const dbRows = await pool.query(`
      SELECT id, 'notes' AS tbl, id AS note_id, attachment_full, thumbnail
      FROM notes
      WHERE attachment_type = 'pdf'
        AND (attachment_full NOT LIKE 'file:%')
        AND attachment_full IS NOT NULL AND attachment_full != ''
        AND (thumbnail IS NULL OR thumbnail = '' OR LENGTH(thumbnail) < ${ICON_THUMB_MAX})
      UNION ALL
      SELECT id, 'note_attachments' AS tbl, note_id, attachment_full, thumbnail
      FROM note_attachments
      WHERE attachment_type = 'pdf'
        AND (attachment_full NOT LIKE 'file:%')
        AND attachment_full IS NOT NULL AND attachment_full != ''
        AND (thumbnail IS NULL OR thumbnail = '' OR LENGTH(thumbnail) < ${ICON_THUMB_MAX})
      ORDER BY note_id, id
    `);

    const rows  = [...fileRows.rows, ...dbRows.rows];
    const total = Math.min(rows.length, LIMIT);

    console.log(`\nFile-on-disk PDFs needing thumbnail : ${fileRows.rows.length}`);
    console.log(`DB-stored PDFs needing thumbnail    : ${dbRows.rows.length}`);
    console.log(`Total to process                    : ${total}`);
    if (DRY_RUN) console.log('DRY RUN — no DB writes\n');
    console.log();

    let ok = 0, skipped = 0, failed = 0;

    for (let i = 0; i < total; i++) {
      const row = rows[i];
      const isFile = row.attachment_full?.startsWith('file:');
      const label  = isFile ? 'disk' : 'db';

      let thumbnail = null;

      if (isFile) {
        const parsed = parseFileRef(row.attachment_full);
        if (!parsed) { skipped++; continue; }
        const absPath = path.join(fileStorage.ATTACHMENTS_DIR, parsed.relPath);
        if (!fs.existsSync(absPath)) {
          console.log(`  [${i+1}/${total}] SKIP (file missing): ${parsed.relPath}`);
          skipped++;
          continue;
        }
        const sizeMB = (fs.statSync(absPath).size / 1024 / 1024).toFixed(1);
        process.stdout.write(`  [${i+1}/${total}] [${label}] ${row.tbl} id=${row.id} (${sizeMB} MB) ${parsed.relPath} ... `);
        thumbnail = generateThumbnailFromFile(absPath);
      } else {
        const sizeKB = Math.round((row.attachment_full || '').length * 3 / 4 / 1024);
        process.stdout.write(`  [${i+1}/${total}] [${label}] ${row.tbl} id=${row.id} (~${sizeKB} KB) ... `);
        thumbnail = generateThumbnailFromBase64(row.attachment_full);
      }

      if (!thumbnail) {
        console.log('FAILED');
        failed++;
        continue;
      }

      const thumbKB = Math.round(thumbnail.length * 3 / 4 / 1024);
      if (!DRY_RUN) {
        if (row.tbl === 'notes') {
          await pool.query('UPDATE notes SET thumbnail = $1 WHERE id = $2', [thumbnail, row.id]);
        } else {
          await pool.query('UPDATE note_attachments SET thumbnail = $1 WHERE id = $2', [thumbnail, row.id]);
          // Fill parent note's thumbnail if still missing/small
          await pool.query(`
            UPDATE notes SET thumbnail = $1
            WHERE id = $2
              AND (thumbnail IS NULL OR thumbnail = '' OR LENGTH(thumbnail) < ${ICON_THUMB_MAX})
          `, [thumbnail, row.note_id]);
        }
      }
      console.log(`OK (thumb ${thumbKB} KB)`);
      ok++;
    }

    console.log(`\nDone. OK: ${ok}, skipped: ${skipped}, failed: ${failed}`);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
