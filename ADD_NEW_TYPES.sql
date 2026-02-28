-- Migration to add POETRY, LYRICS, and JOKES types
-- Run these commands in your PostgreSQL database

-- Step 1: Drop existing constraints on both tables
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_type_check;

-- Step 2: Add new constraints with all 6 types
ALTER TABLE sources ADD CONSTRAINT sources_type_check 
  CHECK (type IN ('BOOK', 'MOVIE-TV', 'ASSORTED', 'POETRY', 'LYRICS', 'JOKES'));

ALTER TABLE quotes ADD CONSTRAINT quotes_type_check 
  CHECK (type IN ('BOOK', 'MOVIE-TV', 'ASSORTED', 'POETRY', 'LYRICS', 'JOKES'));

-- Verify the changes
SELECT 
  table_name, 
  constraint_name, 
  check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%type_check%';
