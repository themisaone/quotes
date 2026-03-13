# Training Notes - Tag-Based Filtering System

## Overview

Training notes now use a flexible tag-based system for year and month organization, instead of requiring exact dates. This allows for:
- **Precise entries** with exact dates (2016.07.15)
- **Month-level precision** with year/month tags only (2016.07)
- **Year-level organization** with year tag only (2016)
- **Reference documents** without any date

## Changes Implemented

### 1. Backend Sorting (Hierarchical)

**File**: `src/server.js`

Training notes are now sorted hierarchically:

```
Year Tag (2026, 2025, 2024... DESC - newest first)
  ├─ No Month Tag → TOP (within year)
  └─ Month Tags (January, February... chronological)
      ├─ No Date → TOP (within month)
      └─ With Date → Sorted by day (1, 2, 3...)
```

**SQL Logic**:
1. **Year** - Extracted from year tags (4-digit tags like "2016")
2. **Month presence** - Items without month tags appear first
3. **Month order** - January=1, February=2, etc.
4. **Date presence** - Items without dates appear first within month
5. **Day** - Sorted by day of month if date exists

### 2. Date Field Made Optional

**File**: `public/index.html`

- Label updated to show **(optional)**
- Placeholder updated to suggest using year/month tags
- No validation required on the date field

**Benefits**:
- Can create training notes without exact dates
- Use tags for flexible grouping
- No need to create "fake" dates (like 2016.12.31)

### 3. Filters Use Tags Instead of Dates

**File**: `src/server.js`

#### Year Filter
**Before**: `EXTRACT(YEAR FROM note_date) = 2016`
**Now**: Filters by year TAG (e.g., tag name = "2016")

#### Month Filter
**Before**: `EXTRACT(MONTH FROM note_date) = 7`
**Now**: Filters by month TAG (e.g., tag name = "July")

#### Training Years Endpoint
**Before**: `SELECT DISTINCT EXTRACT(YEAR FROM note_date)...`
**Now**: `SELECT DISTINCT name FROM tags WHERE name ~ '^[0-9]{4}$'...`

Gets available years from tags instead of from dates.

## Tag Structure

### Year Tags
- Format: 4-digit year (e.g., "2016", "2017", "2026")
- Type: `'training'`
- Created automatically by month tagging script

### Month Tags
- Format: Full month name (e.g., "January", "February")
- Type: `'training'`
- Created automatically by month tagging script

## Tagging Script

**File**: `scripts/tag-training-by-month.sql`

Automatically tags all existing training notes with year and month tags based on their `note_date`.

**Usage**:
```bash
node scripts/tag-training-by-month.js
```

**What it does**:
1. Finds all training notes with a `note_date`
2. Extracts year and month from the date
3. Creates/updates year and month tags (type: 'training')
4. Associates tags with training notes
5. Skips duplicates
6. Shows summary by month

## Use Cases

### 1. Exact Training Date
```
Date: 2016.07.15
Tags: 2016, July
Result: Appears in 2016 > July > day 15
```

### 2. Month-Level Precision
```
Date: (empty or 2016.07.31 as placeholder)
Tags: 2016, July
Result: Appears in 2016 > July > top (before dated entries)
```

### 3. Year-Level Organization
```
Date: (empty or 2016.12.31 as placeholder)
Tags: 2016
Result: Appears in 2016 > top (before monthly entries)
```

### 4. Reference Document
```
Date: (empty)
Tags: 2016 (optional)
Result: General reference material
```

## Benefits

✅ **Flexibility** - No need for exact dates on all entries
✅ **Better Organization** - Hierarchical grouping by year > month > day
✅ **Import-Friendly** - Can import notes with partial date information
✅ **No Fake Dates** - Don't need to create placeholder dates
✅ **Smart Sorting** - Items without dates appear at the top of their group
✅ **Tag-Based Filtering** - Year/month dropdowns filter by tags, not dates

## Migration Notes

- Existing training notes with dates are automatically tagged by the script
- Year and month filters now search tags instead of dates
- The date field remains optional and can be left empty
- Sorting prioritizes tag-based grouping over exact dates

## Technical Details

### Database Schema
- `tags` table: Contains year tags (e.g., "2016") and month tags (e.g., "January")
- `quote_tags` junction table: Links training notes to their year/month tags
- All training-related tags have `type = 'training'`

### API Changes
- `/api/quotes` - Filters by tags instead of date extraction
- `/api/quotes/training-years` - Returns years from tags
- Sorting includes tag-based hierarchy

### Frontend
- Year/month dropdowns still work the same way
- Date field shows as optional in the UI
- No changes needed to existing UI interactions

---

This system provides maximum flexibility while maintaining organized, hierarchical display of training notes!
