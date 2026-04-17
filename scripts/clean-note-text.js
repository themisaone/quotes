#!/usr/bin/env node
/**
 * clean-note-text.js
 *
 * For every note:
 *   1. Strip <en-media ...> tags (Evernote import artefacts)
 *   2. If the result is effectively empty (only whitespace, <br>, empty <p> tags)
 *      → set note_text to NULL
 *
 * Notes whose note_text is already NULL are skipped.
 *
 * Usage:
 *   node scripts/clean-note-text.js           # dry-run
 *   node scripts/clean-note-text.js --apply   # write to DB
 */

require('dotenv').config();
const pool = require('../src/db');

const DRY_RUN = !process.argv.includes('--apply');

const EN_MEDIA_RE = /<en-media[^>]*\/?>/gi;
const EMPTY_RE    = /^(\s|<br\s*\/?>|<p[^>]*>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>)*$/i;

function clean(text) {
  if (!text) return text;
  const stripped = text.replace(EN_MEDIA_RE, '');
  return EMPTY_RE.test(stripped) ? '' : stripped;
}

async function main() {
  console.log(DRY_RUN
    ? '🔍 DRY RUN — pass --apply to commit.\n'
    : '✏️  APPLY MODE\n');

  const { rows } = await pool.query(
    `SELECT id, note_text FROM notes WHERE note_text IS NOT NULL ORDER BY id`
  );
  console.log(`Checking ${rows.length} notes…\n`);

  let nullified = 0;
  let enMediaRemoved = 0;
  let unchanged = 0;

  const client = await pool.connect();
  try {
    if (!DRY_RUN) await client.query('BEGIN');

    for (const row of rows) {
      const cleaned = clean(row.note_text);

      if (cleaned === row.note_text) { unchanged++; continue; }

      if (cleaned === '') {
        nullified++;
        if (DRY_RUN) console.log(`  [${row.id}] → ''  (was: ${JSON.stringify(row.note_text.substring(0, 80))})`);
        else await client.query(`UPDATE notes SET note_text = '' WHERE id = $1`, [row.id]);
      } else {
        enMediaRemoved++;
        if (DRY_RUN) console.log(`  [${row.id}] en-media stripped, text remains`);
        else await client.query(`UPDATE notes SET note_text = $1 WHERE id = $2`, [cleaned, row.id]);
      }
    }

    if (!DRY_RUN) await client.query('COMMIT');
  } catch (err) {
    if (!DRY_RUN) await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('\n─────────────────────────────────');
  console.log(`  Set to NULL (was empty)  : ${nullified}`);
  console.log(`  en-media stripped, kept  : ${enMediaRemoved}`);
  console.log(`  Unchanged                : ${unchanged}`);
  console.log(DRY_RUN ? '\nRe-run with --apply to commit.' : '\n✅ Done.');

  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
