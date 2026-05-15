#!/usr/bin/env node
/**
 * Add YEAR tags to all training notes based on `note_date`.
 *
 * Creates tags like "2014", "2015" and links them via `note_tags`.
 * Year is taken from **`note_date` in the database** (`EXTRACT(YEAR …)`), not
 * from the note title — if imports put the wrong `note_date`, tags follow that.
 * Skips notes that already have the **training** year tag (`tags.type =
 * 'training'`) — if you only have a same-named tag with another type, this
 * script still adds the training tag (different `tags` row).
 *
 * **Dry run:** wraps work in a transaction and **ROLLBACK** at the end so
 * nothing is persisted (good for checking counts / connectivity first).
 *
 * From repository root (needs `.env`):
 *   node scripts/safe-housekeeping/add-year-tags.js
 *   node scripts/safe-housekeeping/add-year-tags.js --dry-run
 */

require('dotenv').config();
const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'quotes_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function addYearTags() {
  const client = await pool.connect();

  try {
    console.log(
      DRY_RUN
        ? '🔍 DRY RUN — all inserts will be rolled back at the end.\n'
        : '✏️  APPLY — tags will be committed.\n'
    );

    await client.query('BEGIN');

    console.log('🔍 Finding all training notes with dates...');

    const notesResult = await client.query(`
      SELECT
        id,
        note_date,
        to_char(note_date::date, 'YYYY-MM-DD') AS note_date_ymd,
        (EXTRACT(YEAR FROM note_date::date))::integer AS note_year,
        comment
      FROM notes
      WHERE note_type = 'training'
        AND note_date IS NOT NULL
      ORDER BY note_date
    `);

    console.log(`📊 Found ${notesResult.rows.length} training notes with dates\n`);

    const yearStats = {};
    let totalTagsAdded = 0;

    for (const note of notesResult.rows) {
      const year = String(note.note_year);

      const tagResult = await client.query(
        `
        INSERT INTO tags (name, type)
        VALUES ($1, 'training')
        ON CONFLICT (name, type) DO UPDATE SET name = tags.name
        RETURNING id
        `,
        [year]
      );

      const tagId = tagResult.rows[0].id;

      const existingResult = await client.query(
        `SELECT 1 FROM note_tags WHERE note_id = $1 AND tag_id = $2`,
        [note.id, tagId]
      );

      if (existingResult.rows.length === 0) {
        await client.query(
          `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)`,
          [note.id, tagId]
        );

        if (!yearStats[year]) yearStats[year] = 0;
        yearStats[year]++;
        totalTagsAdded++;

        const preview = (note.comment || '').substring(0, 45);
        const rawDate = note.note_date_ymd || '';
        console.log(
          `  ✓ Would add / added "${year}" (note_date=${rawDate}) → ${preview}…`
        );
      }
    }

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('\n✅ Dry run finished — transaction rolled back (no tags kept).');
    } else {
      await client.query('COMMIT');
      console.log('\n✅ Done (committed).');
    }

    console.log('\n📊 Summary by year (this run only):');
    Object.keys(yearStats)
      .sort()
      .forEach((year) => {
        console.log(`   ${year}: ${yearStats[year]} notes tagged`);
      });
    console.log(`\n   Total tag links added this run: ${totalTagsAdded}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addYearTags().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
