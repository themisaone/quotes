# Frontend JS Modules

All files in this folder are ES modules, imported with a `?v=YYYYMMDD[x]` cache-busting suffix.

**CRITICAL:** Every file that imports the same module must use **the exact same suffix string** or it gets a separate module instance with separate state. Check `app.js` for the canonical suffix for each module.

---

## Module Reference

### `utils.js`
Pure utility functions. No imports.
- `escapeHtml(text)` — XSS escape
- `resolveAttachmentUrl(value)` — converts `file:note/123.jpg` → `/attachments/note/123.jpg`
- `getAttachmentIcon(type)` — emoji for attachment type (`encrypted` → 🔒, `pdf` → 📄, etc.)
- `formatDateNorwegian(dateString)` — ISO → dd.mm.yyyy
- `parseNorwegianDate(str)` — dd.mm.yyyy → ISO
- `getNorwegianDayName(dateString)` — Norwegian weekday name
- `debounce(func, delay)` — debounce
- `isEmpty(value)`, `truncate(text, max)`, `generateId()`

---

### `api.js`
Backend API calls. All functions return Promises.
- `getQuotes(filters)`, `getQuoteCount(filters)`, `getQuote(id)`
- `createQuote(data)`, `updateQuote(id, data)`, `deleteQuote(id)`
- `getTrainingYears()`, `searchAuthors(q)`, `searchSources(q)`, `searchTags(q)`
- `getSettings()`, `saveSettings(settings)`
- `exportToJson(filters)`, `importFromJson(data, options)`

---

### `noteTypes.js`
Note type configuration and field visibility logic.
- `getNoteTypeConfig(type)` — returns full config object for a type
- `hasAuthorField(type)`, `hasSourceField(type)`, `hasDateField(type)`, `hasTrainingTypeField(type)`
- `getModalTitle(type, isEdit)`, `getMainTextLabel(type)`, `getCommentLabel(type)`
- `updateModalFieldVisibility(type)` — show/hide editor fields
- `updateModalLabels(type)` — relabel fields
- `prepareSubmissionData(type, data)` — clean up form data before POST/PUT

**Note:** `_noteTypeList` is populated lazily from settings. All imports of this module must use the same `?v=` suffix or the list will be empty in some modules.

---

### `viewManager.js`
URL hash routing and menu state.
- `parseUrlHash()` — hash → filter string
- `updateUrlHash(filter)`, `updateActiveMenuState(filter)`, `updatePageTitle(filter)`
- `initializeView()` — reads hash on load, returns current filter
- `switchView(filter)` — programmatic navigation
- `setupHashChangeListener(callback)`

---

### `attachments.js`
File upload and preview helpers.
- `readFileAsBase64(file)` — `File` → base64 data URL
- `downscaleImage(base64, maxW, maxH)` — canvas-based resize
- `createThumbnail(base64, maxW, maxH)` — smaller thumbnail
- `displayImage(container, url)` — set img src and show
- `displayAttachmentPreview(container, icon, label)` — show non-image file
- `clearImagePreview(container, type)` — clear preview area
- `setupPasteHandler(element, callback)` — handle Ctrl+V image paste
- `setupFileUpload(input, callback)` — wire file input → callback
- `getBase64Size(base64)` — bytes count
- `formatFileSize(bytes)` — "1.2 MB"
- `exceedsThreshold(base64, thresholdMB)`

---

### `cardRenderer.js`
Generates card HTML strings. Called from `app.js` inside the display loop.
- `createQuoteCard(quote, currentFilter, getTrainingTypes, getQuoteTypes)` — returns HTML string

Internally splits by note type:
- Training: meta row (type + date) on top, text below
- Other: text on top, meta row (author/source) below

Handles attachment thumbnails, encrypted attachment badge (🔒), tag display, expand/collapse.

---

### `modalRenderer.js`
Populates the note editing modal fields.
- `setupAddModal(noteType, filter, elements, editor, callbacks)` — configure for new note
- `setupEditModal(quote, elements, editor, callbacks)` — configure for editing

`currentAttachmentFileName`: if `attachment_type === 'encrypted'`, derived from the file path by stripping `<noteId>.` prefix and `.enc` suffix.

---

### `displayManager.js`
Manages loading and displaying the note list. Does NOT import `settingsManager` — receives `globalSettings` as a parameter to avoid module instance issues.
- `loadQuotes(filter, page, sort, globalSettings)`
- `loadTotalCount(filter, globalSettings)`
- `buildQuotesParams(filter, page, sort, globalSettings)` — builds `URLSearchParams`
- `addSearchFilters(params, globalSettings)` — appends `hideEncryptedNotes`, `hideTag`, etc.

---

### `filterManager.js`
Search panel UI state.
- Wires up all filter inputs to `debounce(loadQuotes, 300)`
- Manages "has-value" CSS class for active filter highlighting
- Clear button handler
- Dropdown panels for Sources and Training Types

---

### `settingsManager.js`
All settings logic. Module-level `globalSettings` object.
- `loadSettings()` — fetches from `GET /api/settings`, populates `globalSettings`
- `saveSettings()` — POSTs current settings
- `updateSetting(key, value)` — update + save (supports dotted keys: `'colors.button'`)
- `getGlobalSettings()` — returns the `globalSettings` object
- `getQuoteTypes()`, `getTrainingTypes()` — from `globalSettings.noteTypes` / `globalSettings.trainingTypes`
- `renderQuoteTypesList()`, `renderTrainingTypesList()` — render settings UI lists
- `initializeSettings(callbacks)` — wire up entire settings panel

**Settings that affect filtering (stored in `globalSettings`):**
- `hideEncryptedNotes` (bool) — hide notes with encrypted attachments
- `hideNotesWithTag` (bool) — enable tag-based hiding
- `hideTagName` (string) — the tag to hide

---

### `cryptoUtils.js`
Browser-side AES-256-GCM encryption for file attachments.
- `encryptFileBuffer(arrayBuffer, password)` → `Uint8Array` (salt+IV+ciphertext)
- `decryptFileBuffer(encryptedBytes, password)` → `ArrayBuffer` (original file)

No text encryption functions — all text encryption was removed.

---

### `dataManager.js`
Export and import workflows.
- `exportToJson(config)` — triggers JSON backup download (+ big_files_DATE.txt + zip)
- `exportToPdf(config)` — triggers PDF export via Puppeteer
- `handleImportFile(event, config)` — handles JSON backup import with validation UI

---

### `searchManager.js`
Manages the search state object and URL sync.

---

### `autocompleteManager.js`
Shared autocomplete logic for author, source, and tag inputs.

---

### `bulkImport.js`
Handles the bulk import CSV/JSON from the side panel.

---

### `historyManager.js`
Browser history navigation for back/forward between views.

---

### `confirmDialog.js`
Reusable confirmation dialog component.

---

### `pageCoordinator.js`
Coordinates page-level setup: initializes all managers in the correct order on page load.

---

### `listPaneView.js`
Handles the list/detail split-pane view mode.

---

### `attachmentViewer.js`
Manages the full-screen attachment overlay (image zoom, PDF render, audio/video player, text viewer).

---

### `entityModal.js`
Base logic for author and source modals.

---

### `authorModal.js`
Author entity modal — open, display, edit, delete an author.
- `openAuthorModal(authorId, authorName, quoteCount)`
- `setupAuthorModalHandlers({ onAuthorSaved, onAuthorDeleted })`

---

### `sourceModal.js`
Source entity modal — same pattern as authorModal.
- `openSourceModal(sourceId, sourceName, sourceType, quoteCount)`
- `setupSourceModalHandlers({ onSourceSaved, onSourceDeleted, getQuoteTypes })`

---

### `tagsManager.js`
Tags page — list, rename, merge, delete tags.
- `loadTags()` — load and render the tags page
- `filterByTag(tagName)` — switch to notes view filtered by tag
- `deleteTag(id, name)`
- `setupTagOperations()` — wire up rename/merge UI

---

### `translationGroups.js`
Manages the translation group linking UI in the editor modal.

---

### `quoteEditor.js`
Wraps the Quill rich-text editor instance inside the note modal. Handles initialization, getting/setting content, toolbar setup.

---

## Backend Modules (src/)

### `tagHelpers.js`
DB helpers for tags. Cached `checkTagTablesExist`. Functions: `getOrCreateTagIds`, `associateTagsWithNote`, `getTagsForNote`, `getTagsForNotes`, `parseTagInput`.

### `fileStorage.js`
Attachment file system management.
- `getAttachmentsDir()` — base path for all attachment files
- `saveToFilesystem(buffer, subdir, filename)` — write file to disk
- `deleteFromFilesystem(filePath)` — delete file
- `getExtensionFromMime(mimeType)`, `getMimeFromExtension(ext)`
- All attachments go to disk. Only thumbnails remain in DB.
