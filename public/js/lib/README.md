# JS Library Documentation

This folder contains shared JavaScript modules that can be reused across different parts of the application.

## 📚 Modules

### `utils.js`
Pure utility functions with no external dependencies.

**Functions:**
- `escapeHtml(text)` - Escape HTML to prevent XSS
- `resolveAttachmentUrl(attachment)` - Convert file references to URLs
- `getAttachmentIcon(type)` - Get emoji icon for attachment type
- `formatDateNorwegian(dateString)` - Format date as dd.mm.yyyy
- `parseNorwegianDate(dateStr)` - Parse dd.mm.yyyy to ISO format
- `getNorwegianDayName(dateString)` - Get Norwegian day name
- `formatDateWithDayName(dateString)` - Format with day name
- `debounce(func, delay)` - Debounce function execution
- `isEmpty(value)` - Check if value is empty
- `truncate(text, maxLength)` - Truncate text with ellipsis
- `generateId()` - Generate unique ID

**Usage:**
```javascript
import { escapeHtml, formatDateNorwegian } from './lib/utils.js';

const safe = escapeHtml(userInput);
const formatted = formatDateNorwegian('2026-03-09');
```

---

### `api.js`
Backend API communication layer.

**Constants:**
- `API_URL` - Auto-detected API endpoint

**Functions:**
- `fetchWithRetry(url, options, maxRetries, delayMs)` - Fetch with retry logic
- `getQuotes(filters)` - Get quotes with filters
- `getQuoteCount(filters)` - Get filtered count
- `getQuote(id)` - Get single quote
- `createQuote(quoteData)` - Create new quote
- `updateQuote(id, quoteData)` - Update quote
- `deleteQuote(id)` - Delete quote
- `getTrainingYears()` - Get distinct training years
- `searchAuthors(search)` - Search authors
- `searchSources(search)` - Search sources
- `searchTags(search)` - Search tags
- `getSettings()` - Get app settings
- `saveSettings(settings)` - Save app settings
- `exportToJson(filters)` - Export filtered data
- `importFromJson(data, options)` - Import data

**Usage:**
```javascript
import { getQuotes, createQuote } from './lib/api.js';

const quotes = await getQuotes({ note_type: 'training', limit: 20 });
const newQuote = await createQuote({ quote: '<p>Test</p>', note_type: 'training' });
```

---

### `noteTypes.js`
Note type specific logic and behavior.

**Constants:**
- `NOTE_TYPES` - Configuration for all note types

**Functions:**
- `getNoteTypeConfig(noteType)` - Get type configuration
- `hasAuthorField(noteType)` - Check if type has author
- `hasSourceField(noteType)` - Check if type has source
- `hasDateField(noteType)` - Check if type has date
- `hasTrainingTypeField(noteType)` - Check if type has training type
- `getModalTitle(noteType, isEdit)` - Get modal title
- `getMainTextLabel(noteType)` - Get main field label
- `getCommentLabel(noteType)` - Get comment field label
- `getAttachmentLabel(noteType)` - Get attachment field label
- `getDeleteButtonText(noteType)` - Get delete button text
- `getAddButtonText(filter)` - Get add button text
- `getPageTitle(filter)` - Get page title
- `getSearchHeaderText(filter)` - Get search header
- `shouldShowSourcesFilter(filter)` - Check filter visibility
- `shouldShowTrainingFilters(filter)` - Check filter visibility
- `getNoteTypeBadgeHtml(type, showOnly, filter)` - Get badge HTML
- `updateModalFieldVisibility(noteType)` - Update modal fields
- `updateModalLabels(noteType)` - Update modal labels
- `updateAddButtonText(currentFilter, callback)` - Update add button with callback
- `updateSourcesFilterVisibility(currentFilter, populateYears)` - Update filter visibility
- `prepareSubmissionData(noteType, data)` - Prepare form data

**Usage:**
```javascript
import { getNoteTypeConfig, hasAuthorField } from './lib/noteTypes.js';

const config = getNoteTypeConfig('training');
console.log(config.icon); // 💪

if (hasAuthorField(noteType)) {
  // Show author field
}
```

---

### `viewManager.js`
Navigation, routing, and menu state management.

**Functions:**
- `parseUrlHash()` - Parse URL hash to note type filter
- `updateUrlHash(filter)` - Update URL hash
- `updateActiveMenuState(filter)` - Update menu active state
- `updatePageTitle(filter)` - Update page title
- `updateSearchHeader(filter)` - Update search header
- `updateFilterVisibility(filter)` - Show/hide filters
- `updateAddButtonText(filter)` - Update add button
- `initializeView()` - Initialize view from URL
- `switchView(filter)` - Switch to new view
- `setupHashChangeListener(callback)` - Setup navigation listener

**Usage:**
```javascript
import { initializeView, switchView } from './lib/viewManager.js';

// On page load
const currentFilter = initializeView();

// Change view
switchView('training');
```

---

### `attachments.js`
File upload, preview, and display logic.

**Functions:**
- `isBase64Image(value)` - Check if base64 image
- `isBase64File(value)` - Check if base64 file
- `getMimeType(base64String)` - Get MIME type
- `detectAttachmentType(mimeType)` - Detect type from MIME
- `readFileAsBase64(file)` - Read file as base64
- `downscaleImage(base64, maxW, maxH)` - Downscale image
- `createThumbnail(base64, maxW, maxH)` - Create thumbnail
- `displayImage(container, url)` - Display image
- `displayAttachmentPreview(container, icon, label)` - Display file preview
- `clearImagePreview(container, type)` - Clear preview
- `setupPasteHandler(element, callback)` - Setup paste handling
- `setupFileUpload(input, callback)` - Setup file upload
- `getBase64Size(base64String)` - Get file size
- `formatFileSize(bytes)` - Format size for display
- `exceedsThreshold(base64, thresholdMB)` - Check size threshold

**Usage:**
```javascript
import { readFileAsBase64, createThumbnail, displayImage } from './lib/attachments.js';

// Upload file
const base64 = await readFileAsBase64(file);
const thumbnail = await createThumbnail(base64, 300, 300);
displayImage(container, thumbnail);
```

---

### `cardRenderer.js` ⭐
Card rendering and HTML generation.

**Functions:**
- `createQuoteCard(quote, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes)` - Generate card HTML

**Type-specific builders:**
- `buildQuoteMetadata()` - Author/source display
- `buildTrainingMetadata()` - Date/training type display
- `buildGenericMetadata()` - Simple badge display

**Why it works:**
- Accepts context as parameters (no global state dependency)
- Dynamically renders based on note type (quote/training/note/puzzle)
- Shows appropriate metadata (author/source for quotes, date/type for training)
- Handles badges, tags, attachments, expand/collapse

**Usage:**
```javascript
import { createQuoteCard } from './lib/cardRenderer.js';

// In app.js - pass context as parameters
const html = createQuoteCard(quote, currentNoteTypeFilter, getTrainingTypes, getQuoteTypes);
```

**Key insight:** Complex functions CAN be extracted if you pass context as parameters instead of relying on global state!

---

### `modalRenderer.js` ⭐⭐ NEW!
Modal setup and field management - same clean pattern as cardRenderer!

**Main functions:**
- `setupAddModal(noteType, filter, elements, editor, callbacks)` - Configure for adding new note
- `setupEditModal(quote, elements, editor, callbacks)` - Configure for editing existing note

**Type-specific field setters:**
- `setQuoteFields()` - Set author/source fields
- `setTrainingFields()` - Set date/training type fields
- `setDefaultQuoteFields()` - Defaults for new quotes
- `setDefaultTrainingFields()` - Defaults for new training

**Helper functions:**
- `formatMetadataDisplay()` - Format created/updated timestamps
- `formatDateForDisplay()` - dd.mm.yyyy (Norwegian)
- `formatDateForPicker()` - yyyy-mm-dd (HTML5)
- `configureDeleteButton()` - Show/hide with correct label
- `resetModalFields()` - Clear all fields
- `displayMetadata()` / `hideMetadata()` - Timestamp display

**Why same pattern as cardRenderer:**
- Type-specific functions for each note type
- Pass elements and callbacks as parameters
- Returns state object for app to use
- Clean separation of concerns
- Easy to extend for new note types

**Usage:**
```javascript
import { setupAddModal, setupEditModal } from './lib/modalRenderer.js';

// Setup for adding
const elements = { modalTitle, form, inputs, ... };
const state = setupAddModal(noteType, filter, elements, quillEditor, updateFieldVisibility, updateModalLabels);

// Setup for editing
const state = setupEditModal(quote, elements, quillEditor, updateFieldVisibility, updateModalLabels, populateTagsForEdit);
```

**Perfect parallelism:** If you understand cardRenderer, you understand modalRenderer! 🎉

---

## 💡 Benefits

- ✅ **Reusable** - Use across multiple apps
- ✅ **Testable** - Pure functions easy to test
- ✅ **Maintainable** - Changes in one place
- ✅ **Tree-shakable** - Import only what you need
- ✅ **ES6 Modules** - Modern JavaScript standards
- ✅ **Type-specific** - Logic grouped by concern

## 📖 Migration Status

**Phase 1: Foundation** ✅ **COMPLETE**
- [x] `utils.js` - Pure utilities
- [x] `api.js` - Backend communication
- [x] `noteTypes.js` - Type-specific logic
- [x] `viewManager.js` - Navigation & routing
- [x] `attachments.js` - File handling

**Phase 2: Update app.js** ✅ **IN PROGRESS**
- [x] Replace viewManager functions with imports
- [x] Replace utils functions with imports
- [x] Replace noteTypes functions with imports
- [x] Replace cardRenderer with import ⭐
- [ ] Test thoroughly
- [ ] Remove commented code
- [ ] Continue with more extractions

**Phase 3: Separate Apps** (Future)
- [ ] Training app
- [ ] Quotes app
- [ ] Notes app

## 📝 File Structure

```
public/
├── js/
│   └── lib/
│       ├── utils.js          ✅ Pure utilities (4 KB)
│       ├── api.js            ✅ Backend API (9 KB)
│       ├── noteTypes.js      ✅ Type logic (11 KB)
│       ├── viewManager.js    ✅ Navigation (6 KB)
│       ├── attachments.js    ✅ File handling (7 KB)
│       ├── cardRenderer.js   ✅ Card generation (9 KB) ⭐
│       ├── modalRenderer.js  ✅ Modal setup (12 KB) ⭐⭐
│       └── README.md         ✅ Documentation
├── app.js                    📝 Main app (6035 lines, down from 6282)
└── index.html
```

**Total library size:** ~58 KB
**Code reduction in app.js:** ~247 lines (4% reduction, much better organized)
**Modules created:** 6 active, well-organized modules

---

## Backend Modules

The backend has also been refactored for consistency and maintainability:

### `src/tagHelpers.js` (180 lines)
Backend helper for tag management with database caching and transaction support.

**Key Features:**
- ✅ Cached table existence checks (performance optimization)
- ✅ Transaction-safe operations
- ✅ Automatic cleanup of unused tags

**Main Functions:**
- `checkTagTablesExist(forceRecheck)` - Cached check for tag tables
- `getOrCreateTagIds(tagNames, client)` - Create/retrieve tag IDs
- `linkTagsToQuote(quoteId, tagIds, client)` - Create tag relationships
- `updateQuoteTags(quoteId, tagNames, client)` - Complete tag update
- `getTagsForQuote(quoteId)` - Retrieve quote tags
- `getAllTags()` - Get all unique tags
- `deleteUnusedTags(client)` - Clean up orphaned tags

### `src/fileStorage.js` (284 lines)
Hybrid storage manager for attachments (DB + filesystem).

**Key Features:**
- ✅ Centralized MIME type mappings (single source of truth)
- ✅ Automatic threshold-based storage decisions
- ✅ Support for all note types (quotes, training, notes, puzzles)
- ✅ Reusable helper functions for MIME/extension conversion

**Main Functions:**
- `processForStorage(base64String, type, id, suffix, maxSizeMB)` - Store file
- `retrieveFromStorage(value)` - Retrieve file (from DB or filesystem)
- `deleteAttachment(value, type, id, suffix)` - Delete file
- `getExtensionFromMime(mimeType)` - MIME to extension
- `getMimeFromExtension(ext)` - Extension to MIME
- `parseBase64Data(base64String)` - Parse data URLs

**Storage Rules:**
- Files < 1MB → Database (base64)
- Files ≥ 1MB → Filesystem (with `file:path:mimetype` reference)

### `src/migrate-tags.js` (130 lines)
One-time migration script (backup/reference only, not part of active codebase).

**Purpose:** Migrated tags from comma-separated strings to normalized tables.  
**Status:** ✅ Completed

---

For detailed backend refactoring documentation, see [BACKEND-REFACTORING.md](../../../BACKEND-REFACTORING.md).

