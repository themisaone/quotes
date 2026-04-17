#!/usr/bin/env node
/**
 * migrate-h2-to-title.js
 *
 * For every note where note_title IS NULL:
 *   - Strip leading empty markup (whitespace, <br>, <p></p>, <p><br></p>, <p>&nbsp;</p> …)
 *   - If the remaining text starts with <h2>…</h2>:
 *       • Set note_title  = the text content inside the <h2> tag
 *       • Remove that <h2> (plus any leading empties) from note_text
 *   - Otherwise:
 *       • Set note_title = 'No title'
 *
 * Notes that already have a note_title (manually set) are skipped entirely.
 *
 * Usage:
 *   node scripts/migrate-h2-to-title.js           # dry-run (shows what would change)
 *   node scripts/migrate-h2-to-title.js --apply   # actually writes to the DB
 */

require('dotenv').config();
const pool = require('../src/db');

const DRY_RUN = !process.argv.includes('--apply');

// Patterns for elements that are "visually empty" at the top of a note
const LEADING_EMPTY_RE = /^(\s|<br\s*\/?>|<p[^>]*>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>)*/i;

// Matches an <h2> tag (with optional attributes) and captures its inner HTML
const H2_RE = /^<h2([^>]*)>([\s\S]*?)<\/h2>/i;

/**
 * Strip HTML tags from a string to get plain text.
 * Used only for the title (we don't want HTML in note_title).
 */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/**
 * Process a single note_text value.
 * Returns { title, newText } where newText has the leading h2 removed (if any).
 */
function processNoteText(noteText) {
  if (!noteText) return { title: 'No title', newText: noteText };

  // Strip leading empty markup to find the first real element
  const stripped = noteText.replace(LEADING_EMPTY_RE, '');

  const h2Match = stripped.match(H2_RE);
  if (!h2Match) {
    // No h2 at top — just set a default title, leave note_text untouched
    return { title: 'No title', newText: noteText };
  }

  const innerHtml = h2Match[2]; // content between <h2> and </h2>
  const plainTitle = stripTags(innerHtml);

  if (!plainTitle) {
    // Empty <h2><br></h2> — treat as no title, remove the empty h2
    const leadingEmptyLen = noteText.length - stripped.length;
    const newText = noteText.slice(0, leadingEmptyLen) + stripped.slice(h2Match[0].length);
    return { title: 'No title', newText: newText.replace(LEADING_EMPTY_RE, '') };
  }

  // Remove the leading empties + the h2 from note_text
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
    `SELECT id, note_text FROM notes WHERE note_title IS NULL ORDER BY id`
  );

  console.log(`Found ${rows.length} notes without a title.\n`);

  let titledFromH2 = 0;
  let titledNoTitle = 0;
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

  console.log('\n─────────────────────────────────');
  console.log(`  Titled from <h2>  : ${titledFromH2}`);
  console.log(`  Set to "No title" : ${titledNoTitle}`);
  if (errors) console.log(`  Errors            : ${errors}`);
  console.log(DRY_RUN
    ? '\nRe-run with --apply to commit these changes.'
    : '\n✅ Done.');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
