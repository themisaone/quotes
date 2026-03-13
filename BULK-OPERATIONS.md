# Bulk Operations on Filtered Data

## Overview
Perform operations on multiple quotes at once using your existing filtering system. Filter down to exactly what you want, then execute bulk operations.

## How It Works

### 1. Filter Your Data
Use all existing filters to narrow down your selection:
- **Note Type**: Quote, Note, Puzzle, Training
- **Author**: Select specific author
- **Source**: Select specific source
- **Search**: Text search in quote/note
- **Tags**: Filter by tags
- **Types**: Quote source types (for quotes)
- **Training Types**: Training categories (for training)
- **Year/Month**: Date filters (for training/notes)
- **Score**: Score ranges
- **Metadata**: Has author/source/note/tags filters

### 2. Open Bulk Operations
Click **⚡ Bulk Operations** in the left menu (Data Management section)

### 3. Review & Execute
The modal shows:
- **Count**: Number of quotes that will be affected
- **Filters**: Summary of active filters

Choose an operation:
- **🏷️ Tag All With...**: Add the same tag to all filtered quotes
- **📄 Export to PDF**: Export filtered quotes as PDF
- **🗑️ Delete All**: Permanently delete filtered quotes (with confirmation)

## Operations Details

### Tag All
**Use Case**: Add year tags, category tags, or any tag to multiple quotes
```
Example:
1. Filter: Type=Training, Year=2016
2. Operation: Tag All → "2016"
3. Result: All training notes from 2016 get the "2016" tag
```

**Features**:
- Shows count of newly tagged vs. already tagged quotes
- Creates tag with correct type (quote/note/training/puzzle)
- Prevents duplicates (ON CONFLICT DO NOTHING)

### Export to PDF
**Use Case**: Export a subset of your collection
- Reuses existing PDF export functionality
- Exports only filtered quotes
- Same formatting and styling

### Delete All
**Use Case**: Clean up old data, remove test entries, etc.

**Safety Features**:
- Shows exact count before deletion
- Requires typing "DELETE X" (where X is the count)
- Cannot be undone!
- Deletes associated files (images, attachments)

## Backend Implementation

### Filter Query Builder
Reusable `buildFilterQuery()` function that:
- Mirrors the logic from `GET /api/quotes`
- Builds WHERE clauses from filter object
- Returns parameterized query for safety

### API Endpoints

**POST /api/quotes/bulk-tag**
```javascript
Body: {
  filters: { note_type, author_id, search, ... },
  tagName: "2016"
}

Response: {
  count: 15,           // Newly tagged
  total: 23,           // Total matched
  message: "Tagged 15 quotes (8 already had this tag)"
}
```

**POST /api/quotes/bulk-delete**
```javascript
Body: {
  filters: { note_type, year, ... }
}

Response: {
  count: 23,
  message: "Deleted 23 quotes"
}
```

## Code Structure

### Frontend (`public/app.js`)
```javascript
getCurrentFilters()         // Extract all active filters
getFilterSummary()          // Human-readable filter description
openBulkOperationsModal()   // Show modal with count/filters
handleBulkTag()             // Tag operation
handleBulkExportPdf()       // PDF export (reuses existing)
handleBulkDelete()          // Delete operation with confirmation
```

### Backend (`src/server.js`)
```javascript
buildFilterQuery(filters)   // Build SQL WHERE from filter object
POST /api/quotes/bulk-tag   // Tag operation endpoint
POST /api/quotes/bulk-delete // Delete operation endpoint
```

## Usage Examples

### Example 1: Tag All Training Notes by Year
```
1. Click "Training" in note type menu
2. Select Year: 2016
3. Click "⚡ Bulk Operations"
4. Verify: "23 quotes" shown
5. Click "Tag All With..."
6. Enter: "2016"
7. Confirm
✅ Result: All 23 training notes from 2016 now have "2016" tag
```

### Example 2: Delete Test Quotes
```
1. Filter by Author: "Test Author"
2. Click "⚡ Bulk Operations"
3. Verify: "5 quotes" shown
4. Click "Delete All"
5. Type: "DELETE 5"
6. Confirm
✅ Result: All 5 test quotes permanently deleted
```

### Example 3: Export Year's Training to PDF
```
1. Click "Training"
2. Select Year: 2025
3. Click "⚡ Bulk Operations"
4. Verify: "87 quotes" shown
5. Click "Export to PDF"
✅ Result: PDF with all 87 training notes from 2025
```

## Benefits

✅ **Leverages Existing Filters**: No new UI for selection, just use what you already have
✅ **Visual Feedback**: See count and active filters before executing
✅ **Safe**: Confirmation dialogs, especially for destructive operations
✅ **Efficient**: Backend handles all matching quotes in single transaction
✅ **Maintainable**: Filter logic shared between display and bulk ops
✅ **Flexible**: Easy to add new bulk operations in the future

## Future Enhancements (Optional)

Possible additional operations:
- **Bulk Edit**: Change author/source/type for multiple quotes
- **Bulk Export JSON**: Export filtered subset as JSON
- **Bulk Score**: Set score for multiple quotes
- **Bulk Move**: Change note_type (e.g., quote → note)

---
**Date**: 2026-03-13
**Status**: ✅ Complete and Ready to Use
