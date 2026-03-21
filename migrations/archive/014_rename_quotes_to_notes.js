/**
 * Migration 014: Rename tables to reflect current terminology
 * 
 * Changes:
 * - quotes → notes
 * - quote_tags → note_tags
 * - quotes_id_seq → notes_id_seq
 * - note_tags.quote_id → note_tags.note_id
 * 
 * Note: Indexes and foreign keys are automatically renamed by PostgreSQL
 */

const { Pool } = require('pg');

async function runMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('🔄 Starting table rename migration...\n');

  try {
    // Check if migration already applied
    const checkNotes = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'notes'
      );
    `);

    if (checkNotes.rows[0].exists) {
      console.log('⚠️  Migration already applied - "notes" table exists');
      console.log('✅ Skipping migration');
      await pool.end();
      return;
    }

    console.log('📋 Current tables:');
    const beforeTables = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('quotes', 'quote_tags')
      ORDER BY tablename;
    `);
    beforeTables.rows.forEach(row => console.log(`   - ${row.tablename}`));
    console.log('');

    // Step 1: Rename main quotes table
    console.log('1️⃣  Renaming: quotes → notes');
    await pool.query('ALTER TABLE quotes RENAME TO notes;');
    console.log('   ✅ Table renamed');

    // Step 2: Rename junction table
    console.log('2️⃣  Renaming: quote_tags → note_tags');
    await pool.query('ALTER TABLE quote_tags RENAME TO note_tags;');
    console.log('   ✅ Table renamed');

    // Step 3: Rename sequence
    console.log('3️⃣  Renaming: quotes_id_seq → notes_id_seq');
    await pool.query('ALTER SEQUENCE quotes_id_seq RENAME TO notes_id_seq;');
    console.log('   ✅ Sequence renamed');

    // Step 4: Rename column in note_tags table
    console.log('4️⃣  Renaming: note_tags.quote_id → note_id');
    await pool.query('ALTER TABLE note_tags RENAME COLUMN quote_id TO note_id;');
    console.log('   ✅ Column renamed');

    // Verify indexes were auto-renamed
    console.log('\n🔍 Verifying indexes...');
    const indexes = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename IN ('notes', 'note_tags')
      ORDER BY indexname;
    `);
    console.log(`   ✅ Found ${indexes.rows.length} indexes`);
    indexes.rows.forEach(row => console.log(`      - ${row.indexname}`));

    // Verify foreign keys were auto-renamed
    console.log('\n🔍 Verifying foreign keys...');
    const fkeys = await pool.query(`
      SELECT conname FROM pg_constraint 
      WHERE conrelid IN ('notes'::regclass, 'note_tags'::regclass)
      AND contype = 'f'
      ORDER BY conname;
    `);
    console.log(`   ✅ Found ${fkeys.rows.length} foreign keys`);
    fkeys.rows.forEach(row => console.log(`      - ${row.conname}`));

    // Show final table list
    console.log('\n📋 Final tables:');
    const afterTables = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);
    afterTables.rows.forEach(row => console.log(`   - ${row.tablename}`));

    console.log('\n✅ Migration completed successfully!');
    console.log('');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = runMigration;
