# Pagination Implementation

## Summary

Added pagination controls to display 20 quotes per page with navigation buttons.

## Changes Made

### 1. Backend (`server.js`)

**Updated `GET /api/quotes` endpoint** to support pagination:

- Added `offset` parameter (default: 0)
- Query now uses `LIMIT` and `OFFSET` for pagination

```javascript
const { quote, author, book, tags, date, limit = 20, offset = 0 } = req.query;
// ...
query += ` ORDER BY q.created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
params.push(parseInt(limit), parseInt(offset));
```

### 2. Frontend JavaScript (`public/app.js`)

#### State Management

```javascript
let currentPage = 1;
const quotesPerPage = 20;
let totalQuotes = 0;
```

#### Updated `loadQuotes()`

- Calculates offset based on current page
- Sends `limit` and `offset` params to API
- Calls `updatePaginationControls()` after loading

#### Updated `loadTotalCount()`

- Stores total count in `totalQuotes` variable
- Updates pagination controls after fetching count

#### Updated Search/Filter Functions

- `debounceSearch()` - Resets to page 1 when searching
- `clearFilters()` - Resets to page 1 when clearing filters

#### New Pagination Functions

```javascript
function updatePaginationControls() {
    // Displays:
    // - "Showing X-Y of Z quotes"
    // - First | Previous | Page N of M | Next | Last buttons
    // - Disables buttons when at boundaries
}

window.goToPage(page) {
    // Changes currentPage
    // Reloads quotes
    // Scrolls to top
}
```

### 3. Frontend HTML (`public/index.html`)

Added pagination container after quotes list:

```html
<div id="paginationControls" class="pagination-container"></div>
```

### 4. Frontend CSS (`public/style.css`)

Added styling for pagination:

- `.pagination-container` - Flexbox layout, space-between
- `.pagination-info` - Shows "Showing X-Y of Z"
- `.pagination-buttons` - Button group with spacing
- `.page-info` - Current page display
- Disabled button styling (opacity: 0.5)
- Responsive mobile layout (stacks vertically)

## User Experience

### Pagination Display

```
Showing 1-20 of 28 quotes

[First] [Previous] Page 1 of 2 [Next] [Last]
```

### Features

- **First**: Jump to page 1
- **Previous**: Go back one page
- **Next**: Go forward one page
- **Last**: Jump to last page
- **Page indicator**: Shows current page / total pages
- **Count info**: Shows which quotes are currently displayed
- Buttons auto-disable at boundaries (First/Previous on page 1, Next/Last on last page)
- Clicking pagination buttons scrolls to top smoothly
- Search/filter operations reset to page 1

## Technical Details

### Offset Calculation

```javascript
const offset = (currentPage - 1) * quotesPerPage;
// Page 1: offset = 0 (items 1-20)
// Page 2: offset = 20 (items 21-40)
// Page 3: offset = 40 (items 41-60)
```

### Total Pages Calculation

```javascript
const totalPages = Math.ceil(totalQuotes / quotesPerPage);
// 28 quotes / 20 per page = 2 pages
// 45 quotes / 20 per page = 3 pages
```

### Display Range

```javascript
const startItem = totalQuotes === 0 ? 0 : (currentPage - 1) * quotesPerPage + 1;
const endItem = Math.min(currentPage * quotesPerPage, totalQuotes);
```

## Files Modified

1. **server.js** - Added `offset` parameter to quotes endpoint
2. **public/app.js** - Pagination state, functions, and integration
3. **public/index.html** - Pagination container
4. **public/style.css** - Pagination styling

---

**Status**: ✅ Complete
**Date**: 2026-02-21
