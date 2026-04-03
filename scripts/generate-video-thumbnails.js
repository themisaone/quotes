/**
 * generate-video-thumbnails.js
 *
 * Backfill thumbnails for video attachments (MP4, MOV, etc.) stored on disk.
 * Uses ffmpeg to extract a frame at 10% of the video duration as a JPEG thumbnail.
 *
 * Requires: ffmpeg installed (sudo apt-get install -y ffmpeg)
 *
 * Usage:
 *   node scripts/generate-video-thumbnails.js [--dry-run] [--limit N]
 *
 * Options:
 *   --dry-run   List affected rows without writing to DB
 *   --limit N   Process at most N rows (default: all)
 */

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const pool = require('../src/db.js');
const fileStorage = require('../src/fileStorage.js');

const JPEG_QUALITY   = 82;
const ICON_THUMB_MAX = 15000; // smaller = icon placeholder, not a real frame

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT   = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : Infinity;

// ── helpers ────────────────────────────────────────────────────────────────

function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function parseFileRef(ref) {
  if (!ref || !ref.startsWith('file:')) return null;
  const without = ref.slice(5);
  const lastColon = without.lastIndexOf(':');
  if (lastColon === -1) return { relPath: without };
  return { relPath: without.slice(0, lastColon) };
}

function getVideoDuration(videoPath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { timeout: 10000, stdio: 'pipe' }
    );
    return parseFloat(result.toString().trim()) || 0;
  } catch {
    return 0;
  }
}

function generateThumbnailFromVideo(videoPath) {
  const tmpOut = path.join(os.tmpdir(), `vid_thumb_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  try {
    const duration = getVideoDuration(videoPath);
    // Seek to 10% of duration (or 5s minimum, capped at 30s) for a meaningful frame
    const seekSec = duration > 0 ? Math.min(Math.max(duration * 0.1, 5), 30) : 5;

    // Scale to max 320px wide, keep aspect ratio
    const result = spawnSync('ffmpeg', [
      '-ss', String(seekSec.toFixed(2)),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=320:-1',
      '-q:v', String(Math.round((100 - JPEG_QUALITY) / 10) + 1), // ffmpeg quality 1-31 (lower=better)
      '-y',
      tmpOut
    ], { timeout: 30000 });

    if (!fs.existsSync(tmpOut)) return null;
    const jpegBuf = fs.readFileSync(tmpOut);
    return `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
  } catch (e) {
    console.error(`  ✗ ffmpeg failed: ${e.message?.split('\n')[0]}`);
    return null;
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
}

// ── main ───────────────────────────────────────────────────────────────────

(async () => {
  if (!checkFfmpeg()) {
    console.error('❌ ffmpeg not found. Install it first: sudo apt-get install -y ffmpeg');
    process.exit(1);
  }

  try {
    const rows = await pool.query(`
      SELECT id, 'notes' AS tbl, id AS note_id, attachment_full, thumbnail
      FROM notes
      WHERE attachment_type = 'video'
        AND attachment_full LIKE 'file:%'
        AND (thumbnail IS NULL OR thumbnail = '' OR LENGTH(thumbnail) < ${ICON_THUMB_MAX})
      UNION ALL
      SELECT id, 'note_attachments' AS tbl, note_id, attachment_full, thumbnail
      FROM note_attachments
      WHERE attachment_type = 'video'
        AND attachment_full LIKE 'file:%'
        AND (thumbnail IS NULL OR thumbnail = '' OR LENGTH(thumbnail) < ${ICON_THUMB_MAX})
      ORDER BY note_id, id
    `);

    const total = Math.min(rows.rows.length, LIMIT);
    console.log(`\nVideo rows needing thumbnail: ${rows.rows.length}`);
    if (DRY_RUN) console.log('DRY RUN — no DB writes\n');
    console.log(`Processing ${total} rows...\n`);

    let ok = 0, skipped = 0, failed = 0;

    for (let i = 0; i < total; i++) {
      const row = rows.rows[i];
      const parsed = parseFileRef(row.attachment_full);
      if (!parsed) { skipped++; continue; }

      const absPath = path.join(fileStorage.ATTACHMENTS_DIR, parsed.relPath);
      if (!fs.existsSync(absPath)) {
        console.log(`  [${i+1}/${total}] SKIP (file missing): ${parsed.relPath}`);
        skipped++;
        continue;
      }

      const sizeMB = (fs.statSync(absPath).size / 1024 / 1024).toFixed(1);
      process.stdout.write(`  [${i+1}/${total}] ${row.tbl} id=${row.id} (${sizeMB} MB) ${parsed.relPath} ... `);

      const thumbnail = generateThumbnailFromVideo(absPath);
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
