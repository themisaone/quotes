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
URL hash parsing, active-menu state, and page-title text only.
- `parseUrlHash()` — hash → filter string
- `updateUrlHash(filter)`, `updateActiveMenuState(filter)`, `updatePageTitle(filter)`

Search-header text is set statically in `index.html`. The Add-button text comes
from `noteTypes.js::updateAddButtonText`. Filter-visibility is owned by
`filterManager.js::updateSourcesFilterVisibility`. Navigation (`switchView`,
hash listener) is owned by `app.js` (`window.switchView`) and
`pageCoordinator.js` — earlier duplicates that lived in `viewManager.js` were
never wired up and have been removed.

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
- `pruneUnusedEntitiesRequest()` — Options → Maintenance metadata prune request
- `rehomeAttachmentsRequest({ dryRun })` — Options → Maintenance attachment folder scan/apply request

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
Two-column **list + pane** layout (alternative to the card grid). Left: compact rows or (for training) calendar/list toggle; right: full note + actions. Reuses `createQuoteCard` / modals from `app.js`.
- `renderListPaneView(container, notes, opts)`
- `refreshPaneNote(noteId, updatedNote, opts)`
- `getTrainingSubMode()` / `setTrainingSubMode()` — `localStorage` key `lpTrainingSubMode` (`calendar` | `list`); header `#trainingSubModeSelect` in `app.js`

---

### `trainingCalendar.js`
Monthly calendar for training notes in list-pane left column. Days with trainings show **icons** per distinct sub-type (from settings). Legend lists sub-types by icon + label. Fetches month data via API; `onSelectNote` opens the matching row in the pane.
- `renderTrainingCalendar(container, opts)` — `getTrainingTypes`, `onSelectNote`, optional `initialYear` / `initialMonth` / `initialNoteId`

**Import notes:** `app.js` imports `listPaneView.js` with a `?v=` suffix (cache bust). **`paneEditor.js` and `paneAttachments.js` must use the identical `?v=` in `app.js` and `listPaneView.js`** — mismatched suffixes load two module instances. `trainingCalendar.js` imports `api.js` without `?v=`; that can diverge from `api.js?v=…` used elsewhere — avoid adding a second import path for `api.js` from this chain.

### `paneAttachments.js`
List-pane attachment gallery above the inline Quill editor — all files in one horizontal row (images max 512px each; primary ★ with ✕ like extras). Add / encrypt controls; wired from `app.js` via `configurePaneAttachments()`.

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

### `notifications.js`
Toast-style top-right notifications used by the rename modal and tag-operations code.
- `showNotification(message, type)` — `type` is `'info' | 'success' | 'error'` (default `'info'`)

CSS animations `slideIn` / `slideOut` are defined in `style.entities.css`.

---

### `htmlSourceViewer.js`
"📄 HTML" toggle inside the note-edit modal — shows / pastes back the raw HTML behind the Quill editor.
- `initHtmlSourceViewer({ getQuillEditor })` — wires `window.toggleHtmlSource` and `window.applyHtmlSource` for the inline `onclick` attributes in `index.html`. The `getQuillEditor` callback is read each time so the module never holds a stale reference.

---

### `mergeModal.js`
Owns the `#mergeModal` UI: candidate-list rendering, "main" radio selection, the `POST /api/notes/merge` call, and the post-merge cleanup (clear selection, reload list, open the merged note).
- `initMergeModal({ escapeHtml, getApiUrl, getCurrentQuotes, getSelectedNoteIds, clearSelection, loadQuotes, loadTotalCount, openEditModal })` — wires `window.closeMergeModal`, `window.selectMergeMain`, `window.executeMerge`, `window.openMergeModalFromSelection`, `window.openMergeModalFromGroup` for the inline onclick handlers rendered into the modal.
- `openMergeModal(notes)` — entry point with an explicit list of notes.
- `fetchNotesByIds(ids)` — helper used by both this module and the bulk-ops code in `app.js`.

---

### `encryptedAttachments.js`
End-to-end encrypted attachment flow: passphrase prompt → `encryptFileBuffer` → upload as `.enc`, plus the matching decrypt-and-view path.
- `initEncryptedAttachments({ encryptFileBuffer, decryptFileBuffer, showFullImage, showPDFViewer, showVideoPlayer, showAudioPlayer, displayAttachmentPreview, renderModalAttachmentStrip, updateAttachmentPanelVisibility, loadQuotes, getEditingQuoteId, getCurrentNoteTypeFilter, getQuoteImagePreviewEl, getPendingExtraAttachments, hasPrimaryAttachment, setPrimaryEncryptedState })` — wires `window.addEncryptedAttachment` and `window.openEncryptedAttachment`. The latter is invoked from inline onclick handlers rendered by `cardRenderer.js`.

The viewer for decrypted output is chosen from the **original** filename's extension (the on-disk file is always `.enc`).

---

### `dedupSuspectsPanel.js`
Options → **Duplicate inspection**: fetches `/api/dedup/suspects`, renders each note inside a **one-column** `.quotes-list` (never `natural-sizing` / `column-count` in a narrow slot — that used to break card width). Cards sit in a responsive CSS grid (`repeat(auto-fill, minmax(300px, 1fr))`).

---

### `renameModal.js`
Generic rename dialog for tag / author / source. **Note (May 2026):** appears to be orphaned — none of the `window.*` exports are referenced from `index.html`, the rendered card HTML, or any other lib module. The DOM (`#renameModal`) still exists; once we've confirmed nothing uses it, the file (and the HTML) can be deleted.
- `initRenameModal({ getApiUrl, loadTags, loadAuthors, loadSources })` — wires `window.editAuthor`, `window.editSource`, `window.showRenameModal`, `window.hideRenameModal`, `window.performRename` plus the dialog's button/keyboard handlers.

---

### `entityListPage.js`
Renders the Authors and Sources list pages — same shape, shared private helpers.
- `initEntityListPage({ escapeHtml, getApiUrl, getElementByIdSafe, showFetchError })`
- `loadAuthors()` — fetch + filter + sort + display, also updates the `#totalAuthorsCount` / `#filteredAuthorsCount` counters.
- `loadSources()` — same as above but adds the BOOK / MOVIE-TV / POETRY / LYRICS / JOKES / ASSORTED type filter (`ASSORTED` is always shown).
- `displayAuthors(authors)`, `displaySources(sources)` — direct render entry points (used by `pageCoordinator.js` and `historyManager.js`).

The card HTML uses inline `onclick` calls to `window.openAuthorModal` / `window.openSourceModal` / `window.filterByAuthor` / `window.filterBySource` — those globals are wired up by `app.js`, `authorModal.js`, `sourceModal.js`, and `searchManager.js` respectively.

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
