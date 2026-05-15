-- ============================================================================
-- Tag training notes by calendar month (English month name as tag)
-- ============================================================================
-- Tags each row in `notes` with note_type = 'training' using the month
-- derived from `note_date`, creating tags as needed. Uses `note_tags` /
-- `tags` (current schema — not legacy `quotes` / `quote_tags`).
--
-- Usage (from repo root):
--   psql "$DATABASE_URL" -f scripts/safe-housekeeping/tag-training-by-month.sql
-- Or (supports --dry-run with rollback): see tag-training-by-month.js
-- ============================================================================

DO $$
DECLARE
  month_names TEXT[] := ARRAY['January', 'February', 'March', 'April', 'May', 'June',
                               'July', 'August', 'September', 'October', 'November', 'December'];
  month_name TEXT;
  month_num INTEGER;
  tag_id INTEGER;
  training_note RECORD;
  tags_added INTEGER := 0;
  tags_skipped INTEGER := 0;
  month_count INTEGER;
BEGIN
  RAISE NOTICE '🏋️ Starting to tag training notes by month...';

  FOR training_note IN
    SELECT id, note_date
    FROM notes
    WHERE note_type = 'training'
      AND note_date IS NOT NULL
  LOOP
    month_num := EXTRACT(MONTH FROM training_note.note_date)::INTEGER;
    month_name := month_names[month_num];

    SELECT id INTO tag_id FROM tags WHERE name = month_name;

    IF tag_id IS NULL THEN
      INSERT INTO tags (name, type)
      VALUES (month_name, 'training')
      RETURNING id INTO tag_id;
    ELSE
      UPDATE tags SET type = 'training' WHERE id = tag_id AND type IS DISTINCT FROM 'training';
    END IF;

    IF EXISTS (
      SELECT 1 FROM note_tags nt
      WHERE nt.note_id = training_note.id AND nt.tag_id = tag_id
    ) THEN
      tags_skipped := tags_skipped + 1;
    ELSE
      INSERT INTO note_tags (note_id, tag_id)
      VALUES (training_note.id, tag_id);
      tags_added := tags_added + 1;
      IF tags_added % 50 = 0 THEN
        RAISE NOTICE '  ✅ Tagged % training notes so far...', tags_added;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '🎉 Month tagging complete!';
  RAISE NOTICE '  ✅ Tags added: %', tags_added;
  RAISE NOTICE '  ⏭️  Tags skipped (already existed): %', tags_skipped;
  RAISE NOTICE '';

  RAISE NOTICE '📅 Summary by month:';
  FOR month_num IN 1..12 LOOP
    month_name := month_names[month_num];
    SELECT COUNT(*)::INTEGER INTO month_count
    FROM notes q
    JOIN note_tags nt ON q.id = nt.note_id
    JOIN tags t ON nt.tag_id = t.id
    WHERE q.note_type = 'training'
      AND t.name = month_name;

    IF month_count > 0 THEN
      RAISE NOTICE '  % training notes tagged with "%"', month_count, month_name;
    END IF;
  END LOOP;

END $$;
