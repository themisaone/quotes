/**
 * Migrate large base64 attachments to external storage (`attachments/`).
 *
 * Finds `notes` rows where `thumbnail` and/or `attachment_full` is a data-URL
 * larger than the threshold and passes them through `fileStorage.processForStorage`.
 *
 * Usage:
 *   node scripts/migrate-large-attachments.js [threshold-in-MB]
 *
 * Examples:
 *   node scripts/migrate-large-attachments.js       (default 1 MB)
 *   node scripts/migrate-large-attachments.js 2
 *
 * Requires `.env` (or env) with DB_* set. Run from repository root.
 */

'use strict';

const { Pool } = require('pg');
const path = require('path');
const fileStorage = require(path.join(__dirname, '..', 'src', 'fileStorage.js'));
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

function getBase64Size(base64String) {
  if (!base64String || !base64String.startsWith('data:')) return 0;
  const base64Data = base64String.split(',')[1] || '';
  const padding = (base64Data.match(/=/g) || []).length;
  return (base64Data.length * 3) / 4 - padding;
}

function getFolderForNoteType(noteType) {
  if (noteType === 'training') return 'training';
  if (noteType === 'note') return 'notes';
  if (noteType === 'puzzle') return 'puzzles';
  return 'quotes';
}

async function migrateLargeAttachments(thresholdMB = 1) {
  console.log(`\n🔄 Starting migration of large attachments (> ${thresholdMB} MB)...\n`);

  const thresholdBytes = thresholdMB * 1024 * 1024;

  try {
    const query = `
      SELECT id, note_type, thumbnail, attachment_full, attachment_type
      FROM notes
      WHERE (thumbnail IS NOT NULL AND thumbnail LIKE 'data:%')
         OR (attachment_full IS NOT NULL AND attachment_full LIKE 'data:%')
      ORDER BY id
    `;

    const result = await pool.query(query);

    if (result.rows.length === 0) {
      console.log('✅ No base64 attachments found in database - all clean!');
      return;
    }

    console.log(`📊 Found ${result.rows.length} notes with base64 thumbnail and/or attachment_full\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const stats = { byType: {}, totalSizeMB: 0 };

    for (const row of result.rows) {
      const { id, note_type, thumbnail, attachment_full } = row;
      const folder = getFolderForNoteType(note_type || 'quote');

      let needsUpdate = false;
      let newThumb = thumbnail;
      let newFull = attachment_full;
      let sizeMB = 0;

      try {
        if (thumbnail && thumbnail.startsWith('data:')) {
          const imageSize = getBase64Size(thumbnail);
          if (imageSize > thresholdBytes) {
            console.log(`   📦 Migrating thumbnail for note ${id} (${(imageSize / 1024 / 1024).toFixed(2)} MB)...`);
            newThumb = fileStorage.processForStorage(thumbnail, folder, id, '', thresholdMB);
            needsUpdate = true;
            sizeMB += imageSize / 1024 / 1024;
          }
        }

        if (attachment_full && attachment_full.startsWith('data:')) {
          const fullSize = getBase64Size(attachment_full);
          if (fullSize > thresholdBytes) {
            console.log(`   📦 Migrating full attachment for note ${id} (${(fullSize / 1024 / 1024).toFixed(2)} MB)...`);
            newFull = fileStorage.processForStorage(attachment_full, folder, id, '_full', thresholdMB);
            needsUpdate = true;
            sizeMB += fullSize / 1024 / 1024;
          }
        }

        if (needsUpdate) {
          await pool.query(
            `UPDATE notes SET thumbnail = $1, attachment_full = $2 WHERE id = $3`,
            [newThumb, newFull, id]
          );

          migrated++;
          stats.totalSizeMB += sizeMB;

          const typeKey = `${note_type || 'quote'}`;
          if (!stats.byType[typeKey]) stats.byType[typeKey] = { count: 0, sizeMB: 0 };
          stats.byType[typeKey].count++;
          stats.byType[typeKey].sizeMB += sizeMB;

          console.log(`   ✅ Note ${id} migrated (freed ~${sizeMB.toFixed(2)} MB from DB)`);
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`   ❌ Error migrating note ${id}:`, error.message);
        errors++;
      }
    }

    console.log(`\n📊 Migration complete!\n`);
    console.log(`   ✅ Migrated: ${migrated} notes`);
    console.log(`   ⏭️  Skipped: ${skipped} (below ${thresholdMB} MB threshold)`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   💾 Approx. DB payload moved: ${stats.totalSizeMB.toFixed(2)} MB\n`);

    if (Object.keys(stats.byType).length > 0) {
      console.log('📁 By note_type:');
      Object.entries(stats.byType).forEach(([type, data]) => {
        console.log(`   ${type}: ${data.count} rows, ~${data.sizeMB.toFixed(2)} MB`);
      });
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

const thresholdMB = parseFloat(process.argv[2] || '1');

if (Number.isNaN(thresholdMB) || thresholdMB <= 0) {
  console.error('❌ Invalid threshold. Usage: node scripts/migrate-large-attachments.js [threshold-in-MB]');
  process.exit(1);
}

migrateLargeAttachments(thresholdMB)
  .then(() => {
    console.log('\n✅ Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
