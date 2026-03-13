# Type-Specific Tags Feature

## Overview

Tags are now associated with specific note types (quote, note, joke, puzzle, training), allowing for better organization and filtering of tags based on content type.

## Database Changes

### Migration 006: Add Type Column to Tags

**File:** `migrations/006_add_tag_type.js`

**Changes:**
- Added `type` VARCHAR(20) column to `tags` table with default 'quote'
- Added CHECK constraint to ensure valid types: 'quote', 'note', 'joke', 'puzzle', 'training'
- Changed UNIQUE constraint from `(name)` to `(name, type)` - allowing same tag name for different types
- Created index on `type` column for performance
- All existing tags defaulted to type 'quote'

**To run migration:**
```bash
node migrations/006_add_tag_type.js
# or
npm run migrate
```

## Backend Changes

### 1. Tag Helpers (`src/tagHelpers.js`)

Updated `getOrCreateTagIds()` to accept note type parameter:
- Checks if `type` column exists (backward compatibility)
- Creates/retrieves tags with specific note type
- Falls back to old schema if column doesn't exist

### 2. Server API (`src/server.js`)

**Updated Endpoints:**

**POST `/api/quotes`** (Create quote):
- Now passes `note_type` to `getOrCreateTagIds()` when creating tags

**PUT `/api/quotes/:id`** (Update quote):
- Now passes `note_type` to `getOrCreateTagIds()` when updating tags

**GET `/api/tags`** (Get tags):
- New query parameter: `?type=<noteType>`
- Example: `/api/tags?type=note` - returns only tags for notes
- Returns `type` field in response
- Without type parameter, returns all tags

## Frontend Changes

### 1. Autocomplete (`public/js/lib/autocompleteManager.js`)

Updated `fetchTagSuggestions()`:
- Automatically filters tags by current note type (`window.currentNoteTypeFilter`)
- When creating/editing a note, only shows tags for that note type
- Uses `/api/tags?type=<current_note_type>` endpoint

### 2. Tags View (`public/index.html` & `public/app.js`)

**New UI Element:**
- Added "Type" dropdown filter in Tags view header
- Options: All Types, Quotes, Notes, Jokes, Puzzles, Trainings
- Located next to the Sort controls

**JavaScript:**
- Added event listener for type filter dropdown
- Calls `loadTags(selectedType)` when filter changes
- Empty value shows all types

### 3. Tags Manager (`public/js/lib/tagsManager.js`)

Updated `loadTags()`:
- Now accepts optional `typeFilter` parameter
- Passes filter to `/api/tags?type=...` endpoint
- Updates display based on filtered results

### 4. CSS (`public/style.css`)

Added `.search-tags-controls` wrapper:
- Groups type filter and sort controls
- Proper spacing and alignment
- Responsive flex layout

## Usage

### For Users

1. **Creating/Editing Notes:**
   - Tag autocomplete now shows only tags for the current note type
   - When creating a "note", only "note" tags appear
   - New tags are automatically created with the correct type

2. **Tags View:**
   - Use the "Type" dropdown to filter tags by note type
   - "All Types" shows tags from all note types
   - Search and sort work within the filtered set

### For Developers

**Creating tags with specific type:**
```javascript
// Backend (server.js)
const tagIds = await getOrCreateTagIds(tagNames, note_type, client);

// Frontend - autocomplete automatically uses current note type
window.currentNoteTypeFilter // 'note', 'joke', 'puzzle', etc.
```

**Fetching tags by type:**
```javascript
// All tags
const response = await fetch('/api/tags');

// Only note tags
const response = await fetch('/api/tags?type=note');
```

## Data Migration

**Existing tags:**
- All existing tags have been set to type `'quote'`
- You can manually update tags in the database if needed:

```sql
-- Update specific tags to 'note' type
UPDATE tags SET type = 'note' WHERE name IN ('personal', 'diary', 'thoughts');

-- View tags by type
SELECT type, COUNT(*) FROM tags GROUP BY type;
```

## Backward Compatibility

✅ **Fully backward compatible:**
- `tagHelpers.js` checks if `type` column exists before using it
- Works with both old and new schema
- API endpoints work with or without type filter
- Frontend gracefully handles missing type field

## Benefits

1. **Better Organization:** Tags are scoped to note types
2. **Cleaner Autocomplete:** Only relevant tags shown when creating notes
3. **Flexible Filtering:** Filter tags view by note type
4. **Reusable Names:** Same tag name can exist for different types (e.g., "learning" for both notes and puzzles)

## Testing

**Test scenarios:**
1. ✅ Create new note with tags → tags created with type 'note'
2. ✅ Edit existing quote with tags → tags created/updated with type 'quote'
3. ✅ Tag autocomplete shows only current type tags
4. ✅ Tags view can filter by type
5. ✅ Search within filtered tags works
6. ✅ Sort by name/count works within filtered tags
7. ✅ Migration can be run multiple times safely
