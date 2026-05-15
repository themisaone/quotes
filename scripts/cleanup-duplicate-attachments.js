/**
 * Legacy cleanup: duplicate base64 in thumbnail + attachment_full (non-image)
 *
 * Some old imports stored the same payload in both fields. This clears
 * `thumbnail` only when it exactly equals `attachment_full` (both data URLs),
 * so real generated PDF previews are not wiped.
 *
 * Usage:
 *   node scripts/cleanup-duplicate-attachments.js           # dry-run (counts only)
 *   node scripts/cleanup-duplicate-attachments.js --apply # writes to DB
 *
 * Requires `.env` with DB_*. Run from repository root.
 */

const { Pool } = require('pg');
require('dotenv').config();

const APPLY = process.argv.includes('--apply');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

async function cleanupDuplicateAttachments() {
  console.log(APPLY ? '✏️  APPLY — will UPDATE notes\n' : '🔍 DRY RUN — pass --apply to write\n');

  const countQuery = `
    SELECT
      attachment_type,
      COUNT(*)::int AS count,
      SUM(LENGTH(thumbnail)) / 1024.0 / 1024.0 AS total_mb
    FROM notes
    WHERE attachment_type IS NOT NULL
      AND attachment_type != 'image'
      AND thumbnail IS NOT NULL
      AND attachment_full IS NOT NULL
      AND thumbnail LIKE 'data:%'
      AND attachment_full LIKE 'data:%'
      AND thumbnail = attachment_full
    GROUP BY attachment_type
  `;

  const countResult = await pool.query(countQuery);

  if (countResult.rows.length === 0) {
    console.log('✅ No duplicate thumbnail = attachment_full rows found.');
    return;
  }

  console.log('📊 Rows where thumbnail equals attachment_full (non-image):\n');
  let totalMB = 0;
  countResult.rows.forEach((row) => {
    const mb = parseFloat(row.total_mb) || 0;
    console.log(`   ${row.attachment_type}: ${row.count} notes, ~${mb.toFixed(2)} MB in thumbnail column`);
    totalMB += mb;
  });
  console.log(`\n   💾 Total thumbnail payload (redundant): ~${totalMB.toFixed(2)} MB\n`);

  if (!APPLY) {
    console.log('Re-run with --apply to set thumbnail = NULL for these rows.');
    return;
  }

  const updateQuery = `
    UPDATE notes
    SET thumbnail = NULL
    WHERE attachment_type IS NOT NULL
      AND attachment_type != 'image'
      AND thumbnail IS NOT NULL
      AND attachment_full IS NOT NULL
      AND thumbnail LIKE 'data:%'
      AND attachment_full LIKE 'data:%'
      AND thumbnail = attachment_full
    RETURNING id, attachment_type, note_date
  `;

  const updateResult = await pool.query(updateQuery);

  console.log(`✅ Updated ${updateResult.rows.length} row(s).\n`);

  const byType = {};
  updateResult.rows.forEach((row) => {
    byType[row.attachment_type] = (byType[row.attachment_type] || 0) + 1;
  });
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
}

cleanupDuplicateAttachments()
  .then(() => {
    console.log('\n✅ Script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  })
  .finally(() => pool.end());
