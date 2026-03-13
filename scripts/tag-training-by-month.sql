-- ============================================================================
-- Tag Training Notes by Month
-- ============================================================================
-- This script tags all training notes with their corresponding month name
-- based on the note_date field.
--
-- Usage: psql $DATABASE_URL -f scripts/tag-training-by-month.sql
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
BEGIN
  RAISE NOTICE '🏋️ Starting to tag training notes by month...';
  
  -- Loop through each training note that has a date
  FOR training_note IN 
    SELECT id, note_date 
    FROM quotes 
    WHERE note_type = 'training' 
      AND note_date IS NOT NULL
  LOOP
    -- Extract month number (1-12)
    month_num := EXTRACT(MONTH FROM training_note.note_date);
    month_name := month_names[month_num];
    
    -- Get or create the tag
    SELECT id INTO tag_id FROM tags WHERE name = month_name;
    
    IF tag_id IS NULL THEN
      -- Tag doesn't exist, create it
      INSERT INTO tags (name, type)
      VALUES (month_name, 'training')
      RETURNING id INTO tag_id;
    ELSE
      -- Tag exists, update its type to 'training' if needed
      UPDATE tags SET type = 'training' WHERE id = tag_id AND type != 'training';
    END IF;
    
    -- Add the tag to this training note (skip if already exists)
    BEGIN
      INSERT INTO quote_tags (quote_id, tag_id)
      VALUES (training_note.id, tag_id);
      
      tags_added := tags_added + 1;
      
      IF tags_added % 50 = 0 THEN
        RAISE NOTICE '  ✅ Tagged % training notes so far...', tags_added;
      END IF;
      
    EXCEPTION
      WHEN unique_violation THEN
        -- Tag already exists for this note, skip
        tags_skipped := tags_skipped + 1;
    END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Month tagging complete!';
  RAISE NOTICE '  ✅ Tags added: %', tags_added;
  RAISE NOTICE '  ⏭️  Tags skipped (already existed): %', tags_skipped;
  RAISE NOTICE '  📊 Total training notes processed: %', tags_added + tags_skipped;
  RAISE NOTICE '';
  
  -- Show summary by month
  RAISE NOTICE '📅 Summary by month:';
  FOR month_num IN 1..12 LOOP
    month_name := month_names[month_num];
    SELECT COUNT(*) INTO tag_id
    FROM quotes q
    JOIN quote_tags qt ON q.id = qt.quote_id
    JOIN tags t ON qt.tag_id = t.id
    WHERE q.note_type = 'training'
      AND t.name = month_name;
    
    IF tag_id > 0 THEN
      RAISE NOTICE '  % training notes tagged with "%"', tag_id, month_name;
    END IF;
  END LOOP;
  
END $$;
