#!/usr/bin/env node
/**
 * migrate-h2-to-title.js — safe housekeeping (re-runnable)
 *
 * For every **non-training** note where `note_title` IS NULL:
 *   - Strip leading empty markup (whitespace, <br>, empty <p>…)
 *   - If the remaining text starts with <h2>…</h2>:
 *       • Set note_title = plain text inside the <h2>
 *       • Remove that <h2> (and leading empties) from note_text
 *   - Otherwise:
 *       • Set note_title = 'No title' and leave note_text unchanged
 *
 * **Training** rows (`note_type = 'training'`) are **never** selected — the app
 * does not show card titles for them, and new trainings often have NULL titles
 * on purpose, so they would only add noise to dry-run output.
 *
 * Rows that already have any `note_title` set are skipped (not selected).
 *
 * Re-entrancy: After a successful `--apply`, processed rows have a non-null
 * `note_title`; re-run is a no-op until someone clears a title again.
 *
 * From repository root:
 *   node scripts/safe-housekeeping/migrate-h2-to-title.js           # dry-run
 *   node scripts/safe-housekeeping/migrate-h2-to-title.js --apply   # writes DB
 */

require('dotenv').config();
const path = require('path');
const pool = require(path.join(__dirname, '..', '..', 'src', 'db'));

const DRY_RUN = !process.argv.includes('--apply');

const LEADING_EMPTY_RE = /^(\s|<br\s*\/?>|<p[^>]*>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>)*/i;
const H2_RE = /^<h2([^>]*)>([\s\S]*?)<\/h2>/i;

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function processNoteText(noteText) {
  if (!noteText) return { title: 'No title', newText: noteText };

  const stripped = noteText.replace(LEADING_EMPTY_RE, '');

  const h2Match = stripped.match(H2_RE);
  if (!h2Match) {
    return { title: 'No title', newText: noteText };
  }

  const innerHtml = h2Match[2];
  const plainTitle = stripTags(innerHtml);

  if (!plainTitle) {
    const leadingEmptyLen = noteText.length - stripped.length;
    const newText = noteText.slice(0, leadingEmptyLen) + stripped.slice(h2Match[0].length);
    return { title: 'No title', newText: newText.replace(LEADING_EMPTY_RE, '') };
  }

  const leadingEmptyLen = noteText.length - stripped.length;
  const afterH2 = stripped.slice(h2Match[0].length);
  const newText = noteText.slice(0, leadingEmptyLen) + afterH2;

  return { title: plainTitle, newText };
}

async function main() {
  console.log(DRY_RUN
    ? '🔍 DRY RUN — no changes will be written. Pass --apply to commit.\n'
    : '✏️  APPLY MODE — changes will be written to the database.\n');

  const { rows } = await pool.query(
    `SELECT id, note_text
     FROM notes
     WHERE note_title IS NULL
       AND note_type IS DISTINCT FROM 'training'
     ORDER BY id`
  );

  console.log(
    `Found ${rows.length} row(s) with note_title IS NULL (excluding note_type = 'training').\n`
  );
  console.log(
    "ℹ️  Training notes are skipped — they often have no title by design and are not shown in cards.\n"
  );

  let titledFromH2 = 0;
  let titledNoTitle = 0;
  let textWouldChange = 0;
  let errors = 0;

  const client = await pool.connect();
  try {
    if (!DRY_RUN) await client.query('BEGIN');

    for (const row of rows) {
      try {
        const { title, newText } = processNoteText(row.note_text);
        const textChanged = newText !== row.note_text;

        if (DRY_RUN) {
          if (title !== 'No title') {
            console.log(`  [${row.id}] title: "${title}"${textChanged ? ' (note_text trimmed)' : ''}`);
          }
        } else {
          await client.query(
            `UPDATE notes SET note_title = $1, note_text = $2 WHERE id = $3`,
            [title, newText, row.id]
          );
        }

        if (textChanged) textWouldChange++;
        if (title !== 'No title') titledFromH2++;
        else titledNoTitle++;
      } catch (err) {
        console.error(`  ❌ Error processing note ${row.id}:`, err.message);
        errors++;
      }
    }

    if (!DRY_RUN) await client.query('COMMIT');
  } catch (err) {
    if (!DRY_RUN) await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const ok = titledFromH2 + titledNoTitle;
  console.log('\n─────────────────────────────────');
  console.log(`  Titled from leading <h2>     : ${titledFromH2}`);
  console.log(`  Set note_title to "No title" : ${titledNoTitle}`);
  console.log(`  note_text would change       : ${textWouldChange} (only rows with <h2> or empty <h2> cleanup)`);
  if (errors) console.log(`  Errors                       : ${errors}`);
  console.log(`  Total rows ${DRY_RUN ? 'matched' : 'updated'}       : ${ok} (of ${rows.length} selected)`);
  console.log('─────────────────────────────────');
  if (rows.length > 0) {
    console.log(
      DRY_RUN
        ? '\nRe-run with --apply to write. After apply, a normal re-run finds 0 matching rows.'
        : '\n✅ Done. Re-running finds 0 rows until a non-training note has note_title cleared again.'
    );
  } else {
    console.log(DRY_RUN ? '\nNothing to do.' : '\n✅ Nothing to do.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
