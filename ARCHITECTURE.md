# Architecture & Developer Guide

Everything a new session (or developer) needs to understand how this codebase works, including the non-obvious patterns and known gotchas.

---

## Overview

Single-user personal note app. Node.js/Express backend with a PostgreSQL database. Frontend is a vanilla JavaScript SPA (no framework) using native ES modules. No build step — files are served directly by Express.

---

## Backend (`src/server.js`)

One file (~350 lines) focused on startup, static serving, vault initialization, and route registration.

`src/server.js` exports `{ app, startServer }` and only calls `startServer()` when run directly (`node src/server.js`). This keeps normal startup behavior unchanged while allowing tests and future tooling to import the Express app without binding a port or running migrations. New route groups should be moved into `src/routes/*` with injected dependencies, following `instances.js` and `settings.js`.

**Key globals:**
```js
_allowedTypes   // array of note_type strings currently visible (set by active mode)
_modeName       // e.g. 'DEFAULT', 'ALL', 'TRAINING'
```

Mode startup logic lives in `src/modeConfig.js`. Runtime mode routes live in `src/routes/mode.js`. Startup priority is `MODE` environment variable, then `config/local.json` `activeMode`, then `DEFAULT`. Keep mode parsing/fallback logic in helpers so it remains unit-testable. Runtime mode changes preserve other `config/local.json` fields, including `vaultPath`.

Settings load/save routes live in `src/routes/settings.js`. They read from the vault-aware settings path, sync `config/modes.json` when note types change, and preserve `config/local.json` values such as `activeMode` when updating `vaultPath`.

Saved color palette routes live in `src/routes/palettes.js`. Palette files are stored in `getPalettesDir()` as `<name>.json`; backend validation rejects names containing path separators so requests cannot escape the palette directory.

Direct upload routing lives in `src/routes/uploads.js`. It owns the shared Multer disk-storage middleware used by `POST /api/upload-attachment` and `src/routes/attachments.js`. WAV uploads are optionally transcoded through `ffmpeg` to PCM WAV; if transcode fails, the original file is kept and any partial PCM file is removed.

Note attachment CRUD, encrypted file upload, downscale-thumbnail, and make-primary routes live in `src/routes/attachments.js`. Shared attachment response helpers also live there so quote responses and attachment endpoints use the same position-0 rule: the first `note_attachments` row mirrors `notes.thumbnail`, `notes.attachment_full`, and `notes.attachment_type`. Missing note/attachment and make-primary early-return paths roll back open transactions before returning. Add-attachment tracks newly stored `file:` refs and deletes them on rollback; delete-attachment collects old refs and deletes physical files only after `COMMIT`. Encrypted upload routes validate the storage folder, sanitize the original filename, and remove a moved stable file if the DB insert fails. Downscale-thumbnail validates the existing attachment path before overwriting the file. New upload folder hints are canonicalized by `src/attachmentFolders.js`, so legacy view names like `quotes`, `notes`, and `puzzles` are stored as `quote`, `note`, and `puzzle`.

Quote create/update attachment sync helpers live in `src/quoteAttachmentSync.js`. Keep the request-value-to-storage-value decisions there: create finalizes and processes thumbnail/full attachments, update emits only fields that were provided, clear operations keep the legacy flat-column value while syncing `note_attachments` to `null`, and position-0 update/insert SQL is built in one place.

Quote create/update/delete routes track attachment cleanup against transaction state. Create/update track newly stored `file:` refs while the transaction is open and delete those new files on rollback. Replaced or cleared old refs, and files belonging to deleted notes, are deleted only after `COMMIT`, so a later DB failure does not remove files still referenced by the database.

Quote metadata helpers live in `src/quoteMetadata.js`. They own quote author/source upserts, scalar insert/update field mapping, tag sync decisions, and translation-group rename propagation. Update routes resolve an effective note type from the request or existing note row before processing attachments or tags; this prevents updates that omit `note_type` from accidentally storing new attachment/tag data under the default `quote` type.

Quote count/list/bulk search SQL builders live in `src/quoteListQuery.js`. Keep search parsing, text/tag/any-search conditions, metadata filters, mode restrictions, attachment filters, training date/tag filters, and pagination placeholder ordering there. `GET /api/quotes/count`, `GET /api/quotes`, and bulk operations intentionally build filters in different orders for compatibility, so preserve that ordering in helper tests when changing filters. Count and list queries should agree on which filters affect the result set, including comment text search, direct date, date range, and translation-group filters. `buildBulkFilterQuery()` defaults missing filters to the current active mode's allowed types, accepts both legacy `search`/`tag` and list-style `quote`/`tags` aliases, and applies hidden encrypted/tag settings, translation groups, generic sub-types, metadata filters, `date`, and `dateFrom`/`dateTo` for filtered bulk scopes.

Quote response enrichment helpers live in `src/quoteResponse.js`. Use them when a route needs to resolve stored thumbnail refs, apply position-0 attachments, load tag objects, or format the legacy `tags` string. The helpers preserve the existing split between legacy responses without `tag_objects` when tag tables are absent and enriched responses with `tag_objects` when tag tables are available.

JSON export/import routing lives in `src/routes/exportImport.js`. It owns `GET /api/export/json`, the big-file report/info/zip companion endpoints, and `POST /api/import/json`. Import tracks newly created attachment files per note savepoint: savepoint rollback deletes that note's new files, and whole-transaction rollback deletes files from notes whose savepoints were already released. Existing `file:` refs from backups are not treated as newly created files. JSON export/import helper behavior lives in `src/exportImportHelpers.js`: attachment export resolution (embed small `file:` refs, keep/report large refs once per path), date-only normalization for export/import, chunked response writes with backpressure handling, response end wrapping, and `notes.id` sequence alignment.

DB-stored attachment export routing lives in `src/routes/dbAttachmentExport.js`. It owns `POST /api/export/db-attachments`, queries base64 `attachment_full` values from `note_attachments` plus flat note rows not already covered by attachment rows, and writes them under `~/Downloads/DB-attachments/<note_type>/` without overwriting existing files.

Attachment disk migration routing lives in `src/routes/attachmentMigration.js`. It owns `POST /api/migrate/attachments-to-disk`, consolidates legacy plural attachment folders, migrates base64 `attachment_full` values to disk, repairs stale `tmp_` file references, and synchronizes flat `notes.attachment_full` with position-0 `note_attachments` rows. The route keeps a filesystem rollback journal for file moves and newly written refs, so a DB rollback moves renamed files back and deletes newly materialized migration files. Tmp-reference repair does not overwrite an existing final target file; it points the DB at the existing target and leaves the tmp file for later cleanup.

PDF export routing lives in `src/routes/pdfExport.js`. It owns `POST /api/export/pdf`, quote-only author/source grouping, mixed-note flat layout, PDF HTML generation, attachment thumbnail pre-resolution, and Puppeteer PDF rendering. The route closes the Puppeteer browser in a `finally` block so render failures do not leak browser processes.

Quote route registration lives in `src/routes/quotes.js`. It owns quote read routes, translations, `POST /api/quotes`, `PUT /api/quotes/:id`, `DELETE /api/quotes/:id`, and `POST /api/notes/merge`, with dependencies injected from `src/server.js` for file storage, the current mode's allowed types/name, attachment enrichment, and tag enrichment. Bulk quote route registration lives in `src/routes/quoteBulk.js`; it owns `POST /api/quotes/ids`, `POST /api/quotes/bulk-count`, tag/group/sub-type operations, duplicate, split, and delete. Duplicate inspection routing lives in `src/routes/dedup.js`; it owns `GET /api/dedup/suspects`, keeps the sync-db fingerprint SQL isolated, and reuses `quoteResponse` enrichment dependencies. Keep future quote endpoint moves incremental so route ordering stays correct for fixed paths like `/api/quotes/random` before `/api/quotes/:id`.

Transaction early-return helpers live in `src/transactionResponses.js`. Use them for routes that already opened `BEGIN` and need to return a validation, not-found, or no-op response before `COMMIT`; this prevents pooled clients from being released with an open transaction.

Maintenance routes live in `src/routes/maintenance.js`. `POST /api/maintenance/prune-unused-entities` deletes unreferenced authors, sources, and tags in one transaction. `POST /api/maintenance/rehome-attachments` defaults to dry-run: it joins `note_attachments` to `notes`, compares each file reference folder with the note's current canonical `note_type`, and reports movable items, missing source files, target collisions, and invalid references. Passing `{ "dryRun": false }` moves only items currently marked movable, updates `note_attachments`, updates flat `notes.thumbnail` / `notes.attachment_full` for position-0 attachments, and reports skipped or failed items. Each item uses a DB savepoint, and a failed DB update attempts to move the file back to its original path.

Options has a dedicated **Maintenance** tab for duplicate inspection, unused metadata pruning, and attachment folder scan/apply actions.

Vault routes live in `src/routes/vault.js`. `GET /api/vault/info` reports attachment counts, settings metadata, and palette paths. `POST /api/vault/validate` checks writability with a unique temporary test file so it does not overwrite an existing `.write-test` file. `POST /api/vault/move` copies the current attachment tree to a requested destination, reports per-file copy errors, and rejects destinations inside the source directory to avoid recursive self-copying.

Author and source route registration lives in `src/routes/authors.js` and `src/routes/sources.js`. Shared helper logic lives in `src/entityPayload.js` and `src/entityQueries.js`. Image payload helpers preserve `image: null` as an explicit clear operation, fall back to the legacy `thumbnail` field, and validate image payloads before author/source update routes open a DB transaction. Query/response helpers keep list SQL, dynamic update SQL, merge responses, and delete messages testable. Author/source 404 paths roll back open transactions before returning. Author/source updates with no updatable fields return `400` instead of issuing invalid SQL.

Tag browse, create, rename, delete, and bulk-add routes live in `src/routes/tags.js`. Route-level validation trims tag names before DB work, avoids opening transactions for invalid rename/bulk-add requests, and rolls back missing-tag/source-tag paths before returning. Tag delete now only performs the delete transaction; the previous unused remaining-tag query loop had no side effects and was removed.

**Request flow for note listing:**
1. `GET /api/quotes` — receives filter query params
2. Builds a single SQL query with dynamic WHERE clauses
3. Fetches attachments for all returned notes in one extra query (`getAttachmentsForNotes`)
4. Attaches them via `applyAttachments()` — sets `note.attachments[]` and keeps flat columns (`attachment_full`, `attachment_type`) in sync with position-0 attachment
5. Returns JSON

**`attachment_full` field format:**
- `file:note/123.doc.pdf` — file on disk (resolved to `/attachments/note/123.doc.pdf` by frontend)
- `data:image/jpeg;base64,...` — embedded base64 (thumbnails only, since all full attachments moved to disk)
- `file:note/456.secret.txt.enc` — encrypted file on disk

**Multi-instance / Services UI:** `src/instanceManager.js` probes fixed ports from `config/instance-ports.json`, spawns detached `node src/server.js` children with `MODE` + `PORT` + `SKIP_MIGRATE=1`, and tracks PIDs in `config/running-instances.json`. `src/routes/instances.js` registers `GET/POST /api/instances*` routes so the sidebar **Services** view can start/stop siblings on the same host. Disabled when `INSTANCE_MANAGER=0`. Requires `lsof` on Linux for stop when PID is unknown.

---

## Testing

Run `npm test` to execute the Node-native test suite (`node --test tests/*.test.js`). Current tests avoid a live database and cover pure helpers plus import seams:

- `src/fileStorage.js` path/reference/base64 behavior using temporary attachment directories
- `src/attachmentRehome.js` attachment folder drift planning, apply behavior, and path-safety handling
- `src/entityPayload.js` author/source image payload selection and validation
- `src/entityQueries.js` author/source list/update SQL builders and response payloads
- `src/exportImportHelpers.js` JSON export/import date normalization, attachment embedding/reporting, stream backpressure, and sequence sync
- `src/routes/attachmentMigration.js` attachment disk migration behavior, including base64 migration, legacy folder consolidation, stale tmp-reference repair, sync queries, DB rollback handling, and filesystem rollback compensation
- `src/routes/attachments.js` attachment list/create/delete/file-upload/downscale/make-primary behavior with fake pool/client objects and temporary files, including rollback cleanup and post-commit deletion ordering
- `src/routes/authors.js` author list/get/create/update/delete behavior with fake pool/client objects
- `src/routes/dbAttachmentExport.js` DB-stored attachment export route selection, output path construction, skip handling, and query failures
- `src/routes/dedup.js` duplicate-suspect grouping, pagination bounds, enrichment, and error handling
- `src/routes/exportImport.js` streaming JSON export, big-file companion endpoints, and JSON import behavior, including attachment cleanup for savepoint and transaction rollback
- `src/routes/instances.js` route behavior with a stubbed instance manager
- `src/routes/maintenance.js` unused-entity prune plus attachment rehome dry-run/apply behavior
- `src/routes/mode.js` mode status/switching behavior and local config preservation
- `src/routes/palettes.js` palette list/load/save/delete behavior and path-safety validation
- `src/routes/pdfExport.js` PDF export validation, HTML layout decisions, mocked Puppeteer rendering, and browser cleanup on render failure
- `src/routes/quoteBulk.js` quote bulk ID/count/tag/group/sub-type/duplicate/split/delete behavior with fake pool/client objects, including attachment copy/delete cleanup around transaction commit and rollback
- `src/routes/quotes.js` quote read/create/update/delete/translation/merge behavior with fake pool/client and enrichment dependencies, including attachment cleanup around rollback and commit
- `src/routes/settings.js` settings file, vault-path, mode-sync, and stale sub-type behavior
- `src/routes/sources.js` source list/get/create/update/delete behavior with fake pool/client objects
- `src/routes/tags.js` tag browse/create/rename/delete/bulk-add behavior and transaction early-return paths
- `src/routes/uploads.js` direct upload response formatting, MIME fallback, route registration, and WAV transcode fallback behavior
- `src/routes/vault.js` vault info summaries, directory stats, validation, and attachment-tree copy behavior
- `src/modeConfig.js` startup mode resolution and fallback behavior
- `src/quoteAttachmentSync.js` quote create/update attachment storage decisions, newly stored file-ref tracking, and position-0 sync SQL builders
- `src/quoteListQuery.js` quote count/list/bulk search parsing, SQL filter construction, and parameter ordering
- `src/quoteMetadata.js` quote author/source upsert behavior, scalar field mapping, tag sync decisions, and translation-group propagation
- `src/quoteResponse.js` quote image/attachment/tag response enrichment helpers
- `src/tagHelpers.js::parseTagInput`
- `src/transactionResponses.js` rollback-before-response helpers for open transactions
- `src/noteText.js::sanitizeNoteText`
- `src/server.js` export behavior

Prefer this pattern for new low-level coverage: extract pure helpers from `src/server.js`, test them under `tests/`, then wire them back into routes. Future API integration tests can import `app` from `src/server.js` and listen on an ephemeral port, but should use an explicit test database instead of the user's configured database.

---

## Database Schema

Six tables:

| Table | Purpose |
|---|---|
| `notes` | Main note table. Has flat `thumbnail`, `attachment_full`, `attachment_type` columns that mirror `note_attachments` position=0 |
| `authors` | Authors with optional image |
| `sources` | Sources (books, movies, etc.) with type and optional image |
| `tags` | Tag names, each scoped to a `type` (note_type) |
| `note_tags` | Many-to-many: note ↔ tag |
| `note_attachments` | Multi-attachment table. Position 0 = primary, mirrored to `notes` flat columns |

**Important:** The `notes` table has both flat attachment columns (`attachment_full`, `attachment_type`, `thumbnail`) AND the `note_attachments` table. These are kept in sync: any change to position=0 in `note_attachments` also updates `notes`.

---

## Frontend Module System — CRITICAL GOTCHA

The frontend uses native ES modules with a **`?v=` version suffix** on imports for cache busting.

**Rule: every file that imports a shared module must use the SAME version string.**

```js
// ✅ Correct — all files use the same suffix → single module instance
import { getGlobalSettings } from './settingsManager.js?v=20260318j';

// ❌ Wrong — different suffix or no suffix → separate module instance
import { getGlobalSettings } from './settingsManager.js';   // different instance!
import { getGlobalSettings } from './settingsManager.js?v=123'; // different instance!
```

**Why this matters:** ES modules are singletons — but only per URL. Two different URL strings = two separate instances = separate state. `globalSettings` in one instance is `null` even after it was loaded in another.

**This has caused bugs before:**
- `noteTypes.js` was imported with and without `?v=` → `_noteTypeList` was empty in some modules → all cards fell back to `generic` layout
- `displayManager.js` importing `settingsManager.js` without the suffix → `getGlobalSettings()` always returned null → `hideEncryptedNotes` and `hideNotesWithTag` filters never fired

**Current convention:** Check existing imports in `app.js` to find the canonical suffix for each module, then use exactly that string everywhere.

---

## Settings Flow

Settings are stored in `config/settings.json` (server-side). The frontend loads them on startup and holds them in `globalSettings` inside `settingsManager.js`.

```
settings.json
    ↓ GET /api/settings
settingsManager.loadSettings()
    → globalSettings (module-level variable in settingsManager.js)
    ↓ getGlobalSettings()
app.js loadQuotes()
    → passes currentSettings as 4th arg to loadQuotesLib()
    → displayManager.buildQuotesParams(... globalSettings)
    → addSearchFilters(params, globalSettings)
    → params.append('hideEncryptedNotes', 'true') if enabled
    → params.append('hideTag', tagName) if enabled
```

**Key point:** `displayManager.js` does NOT import `settingsManager.js`. It receives `globalSettings` as a function parameter to avoid the module instance problem. Any new code in `displayManager` that needs settings must receive them through the parameter chain, not via import.

---

## Attachment Architecture

All full-size attachments are stored on disk under `attachments/<note_type>/`. Only thumbnails stay in the database as base64.

The DB `file:` reference is the source of truth for an attachment's path. Changing a note from one `note_type` to another does **not** move existing files between vault folders; those attachments keep resolving from their stored paths. This is functionally safe but can leave older files organized under a previous type folder until an explicit migration/rehome action is run.

**File naming convention:**
- Normal: `<noteId>.<originalFilename>` (e.g. `5236.photo.jpg`)
- Encrypted: `<noteId>.<originalFilename>.enc` (e.g. `5236.doc.txt.enc`)
- Legacy (pre-migration): `<noteId>_full.<ext>` (still supported for reading)

**Serving attachments:** Express serves `GET /attachments/*` from `fileStorage.getAttachmentsDir()` which is set from `config/local.json` → `vaultPath` + `/attachments`. If vault path is not set, defaults to `./attachments/` relative to app root. **Docker:** if `vaultPath` is an absolute host path, bind-mount that directory at the same path inside the container (see `DOCKER.md`), or attachments and vault `settings.json` will not resolve.

**Resolving `file:` references (frontend):**
```js
// utils.js
function resolveAttachmentUrl(attachment) {
  if (attachment.startsWith('file:')) {
    return `/attachments/${attachment.slice(5)}`;
  }
  return attachment;
}
```

---

## Encryption

AES-256-GCM symmetric encryption using the Web Crypto API (browser-side only — server never sees the plaintext).

**Implementation:** `public/js/lib/cryptoUtils.js`

**Blob format (binary):** `salt (16 bytes) | IV (12 bytes) | ciphertext+tag (n bytes)`

**Key derivation:** PBKDF2, 200,000 iterations, SHA-256

**Flow — encrypt:**
1. User clicks "🔒 Encrypt & attach" → file picker opens
2. User selects file → password prompt appears
3. `encryptFileBuffer(buffer, password)` → `Uint8Array`
4. File posted as multipart to `POST /api/notes/:id/attachments/file`
5. Server saves as `<noteId>.<origName>.enc`, inserts row with `attachment_type='encrypted'`

**Flow — decrypt:**
1. User clicks lock icon in card or modal preview
2. `openEncryptedAttachment(fileUrl, originalName)` called
3. Resolves `file:` URL → fetches encrypted bytes
4. Password prompt → `decryptFileBuffer(encBytes, password)` → `ArrayBuffer`
5. Creates `Blob`, detects MIME from original extension, opens appropriate viewer

**Password manager suppression:** Password inputs have `readonly` attribute removed after 80ms on open, non-password `id`/`name` attributes, and a hidden "confirm" field always in DOM (tricks LastPass into treating it as a registration form rather than login).

---

## Card Rendering

Cards are generated in `cardRenderer.js` as HTML strings and inserted via `innerHTML`.

**Card layout differs by note type:**
- `training` cards: metadata row (type + date) **on top**, text below
- All other types: text **on top**, metadata row (author/source) below

**`attachment_type` values and how they render:**
| value | Renders as |
|---|---|
| `image` | Thumbnail image |
| `pdf` | PDF icon + filename |
| `audio` | Audio icon + filename |
| `video` | Video icon + filename |
| `document` | Document icon |
| `encrypted` | 🔒 + original filename (derived from path) |

**Deriving original filename from encrypted path:**
```js
const rawPath = 'file:note/5236.mydoc.txt.enc'.replace(/^file:/, '').split('/').pop();
// rawPath = '5236.mydoc.txt.enc'
const origName = rawPath.replace(/^\d+\./, '').replace(/\.enc$/i, '');
// origName = 'mydoc.txt'
```

---

## Modal State Variables (app.js)

The note editing modal relies on several module-level variables in `app.js`:

| Variable | Holds |
|---|---|
| `editingQuoteId` | ID of note being edited, or null for new note |
| `currentQuoteImage` | thumbnail data URL or empty string |
| `currentQuoteImageFull` | `file:` reference or base64, or `'_pending_enc_'` sentinel for pending encrypted attachment |
| `currentAttachmentType` | `'image'`, `'pdf'`, `'encrypted'`, etc. |
| `currentAttachmentFileName` | Original filename for non-image attachments |
| `pendingExtraAttachments` | Array of attachments queued on an unsaved note |
| `currentModalAttachments` | Attachments array for a note being edited |
| `window._primaryEncAttData` | Stash for primary encrypted attachment on new (unsaved) note |

**Multi-attachment strip:** Only shown when a note has 2+ attachments. Single-attachment notes show the attachment only in the main preview area.

---

## Server-Side Filtering

The `/api/quotes` listing endpoint, `/api/quotes/count`, and filtered bulk endpoints (`/api/quotes/ids`, bulk count/actions without explicit IDs) accept these filter params as SQL WHERE clauses.

| Param | Effect |
|---|---|
| `hideEncryptedNotes=true` | Excludes notes with `attachment_type='encrypted'` or any encrypted note_attachment |
| `hideTag=<tagname>` | Excludes notes tagged with the given tag (case-insensitive) |
| `hasImage=true/false` | Filter by attachment presence |
| `hasImageType=true/false` | Filter by image-type attachment |
| `hasMultipleAttachments=true/false` | Filter by attachment count |
| `hasTranslationGroup=true/false`, `hasTitle=true/false`, `hasText=true/false` | Filter by metadata presence |
| `any`, `quote`, `author`, `source`, `tags`, `score` | Text/search filters; bulk also accepts legacy `search` and `tag` aliases |
| `note_type` | Filter by note type |
| `types` | Filter by quote sub-types |
| `training_types` | Filter by training sub-types |
| `generic_sub_types` | Filter by configured generic note sub-types stored in `notes.type` |
| `year`, `month` | Training tag filters (month requires year) |
| `date`, `dateFrom`, `dateTo` | Direct `notes.note_date` filters |
| `translation_group` | Exact translation-group filter |

---

## CSS File Layout

Styles are split across **15 files** so each one is small enough to read without burning huge tokens. They are loaded **in this exact order** by `index.html`; the order mirrors the original line order in the pre-split monolith so cascade behaviour is preserved.

```
public/style.css              ← base — root vars, body, scrollbar, app-layout (~95 lines)
public/style.sidemenu.css     ← left-side menu (~310 lines)
public/style.search.css       ← search panel + filters + counters (~600 lines)
public/style.buttons.css      ← all button variants + refresh animations (~200 lines)
public/style.modal.css        ← note-editor modal + form fields + score dice (~620 lines)
public/style.cards.css        ← note cards (grid + content + Quill text) (~640 lines)
public/style.selection.css    ← bulk-select mode + select-action-bar (~565 lines)
public/style.attachments.css  ← image upload + attachment viewers + multi-attachment strip (~715 lines)
public/style.entities.css     ← author/source/tag cards, rename modal, tag-ops panel, notifications (~865 lines)
public/style.settings.css     ← settings page, type management, translations, dedup panel (~540 lines)
public/style.dialogs.css      ← merge modal + custom confirm dialog (~300 lines)
public/style.views.css        ← gallery + list-pane + training calendar + encryption UI + banners (~710 lines)
public/style.mobile.css       ← all max-width @media queries (mobile + 480 + 720 + 767 + 900 tablet)
public/style.small.css        ← portrait-phone refinements (max-width 767px + orientation: portrait); hand-maintained
public/style.medium.css       ← all (min-width: 768px) and (max-width: 1100px) @media queries
```

**Why this order matters.** CSS picks the *last* rule when specificity ties. The feature files load in the same order their rules originally appeared in the monolith, then the responsive overlays come last so they override base rules at their breakpoints. Load order among responsive files: `mobile` → `small` → `medium` (portrait tweaks sit between broad mobile and the medium-width band).

A few features had non-contiguous content in the original (e.g. `.search-section` rules appeared at lines 405-899 *and* 1709-1810). Both fragments now live in the **same** feature file, in their original relative order — verified that no selector in the gap (buttons, modal, selection) overlaps the fragments, so the cascade outcome is unchanged.

**Cache-busting.** All `<link>` tags use the same `?v=` query string. Bump the version on every link together when shipping CSS changes.

**Adding new rules:**
- Pick the file whose theme matches (e.g. button styles → `style.buttons.css`, anything inside the note modal → `style.modal.css`).
- Anything inside a `@media (max-width: ...)` query: append to `public/style.mobile.css`.
- Portrait-phone-only tweaks (`max-width: 767px` **and** `orientation: portrait`): append to `public/style.small.css`.
- Anything inside `@media (min-width: 768px) and (max-width: 1100px)`: append to `public/style.medium.css`.
- If a new top-level theme emerges (large enough to warrant its own file), add it to `index.html` *in the position that matches its original-cascade place* and update this list.

**Re-splitting if needed.** Archival one-shot parsers live under `scripts/done-once/`: `split-css.js` (responsive split) and `split-base-css.js` (feature split). See `scripts/done-once/README.md`. Neither is part of the regular build — they should not be re-run on the already-split files unless you deliberately merge CSS and re-split. They are kept as reference if the layering is ever reorganised again.

## Medium-Screen Layout (768px – 1100px)

The medium file (`public/style.medium.css`) overrides font sizes using `--m-font-*` variables (e.g. `--m-font-base: 0.75rem`, `--m-font-xl: 1.0rem`) declared inside its first `@media` block. These are *separate* from the desktop `--d-font-*` variables in `style.css`. The card grid is locked to 2 columns on medium screens.

**Adding medium overrides:** Always put them inside the `@media (min-width: 768px) and (max-width: 1100px)` block in `style.medium.css` and use `!important` (the same pattern as existing rules).

---

## View Modes (frontend)

| Mode | Trigger | Module |
|------|---------|--------|
| Card grid | Default | `cardRenderer.js` + `displayManager.js` |
| Gallery | Column control → `gallery` | `app.js` adds `gallery-mode` class, forces image filters |
| List + pane | Layout toggle when not in gallery | `listPaneView.js`; training calendar via `trainingCalendar.js` |

Gallery and list-pane are mutually exclusive (gallery always uses the card grid).

---

## Key Files Quick Reference

| File | What to edit |
|---|---|
| `src/server.js` | Express startup, static serving, vault initialization, and route registration |
| `src/attachmentFolders.js` | Canonical attachment folder mapping and validation |
| `src/attachmentRehome.js` | Attachment folder drift planner and apply helper |
| `src/entityPayload.js` | Author/source image payload selection and validation |
| `src/entityQueries.js` | Author/source SQL builders and response helpers |
| `src/exportImportHelpers.js` | JSON export/import helper behavior |
| `src/routes/attachmentMigration.js` | Attachment disk migration route registration |
| `src/routes/attachments.js` | Note attachment CRUD, encrypted upload, and primary-selection routes |
| `src/routes/authors.js` | Author entity API route registration |
| `src/routes/dbAttachmentExport.js` | DB-stored attachment export route registration |
| `src/routes/dedup.js` | Duplicate inspection route registration |
| `src/routes/exportImport.js` | JSON export/import route registration |
| `src/routes/instances.js` | Multi-instance Services API route registration |
| `src/routes/maintenance.js` | Maintenance prune, dry-run, and apply route registration |
| `src/routes/mode.js` | Runtime mode status and switching routes |
| `src/routes/palettes.js` | Saved color palette file routes |
| `src/routes/pdfExport.js` | PDF export route registration and rendering helpers |
| `src/routes/quoteBulk.js` | Quote bulk selection/action route registration |
| `src/routes/quotes.js` | Quote read/create/update/delete/translation/merge route registration |
| `src/routes/settings.js` | Settings load/save route registration and mode sync |
| `src/routes/sources.js` | Source entity API route registration |
| `src/routes/tags.js` | Tag browse, rename/delete, and bulk-add route registration |
| `src/routes/uploads.js` | Direct upload route, Multer storage, WAV transcode helpers |
| `src/routes/vault.js` | Vault info, path validation, and attachment-tree copy routes |
| `src/modeConfig.js` | Startup mode loading, normalization, and fallback logic |
| `src/noteText.js` | Note text cleanup and Evernote artifact stripping |
| `src/quoteListQuery.js` | Quote count/list/bulk query builders and search condition helpers |
| `src/quoteMetadata.js` | Quote create/update metadata helpers and effective note-type resolution |
| `src/quoteResponse.js` | Quote attachment/tag response enrichment helpers |
| `src/transactionResponses.js` | Rollback response helpers for transaction early returns |
| `tests/*.test.js` | Node-native automated tests |
| `public/app.js` | Modal logic, card click handlers, main event wiring |
| `public/js/lib/cardRenderer.js` | Card HTML generation |
| `public/js/lib/modalRenderer.js` | Modal field population |
| `public/js/lib/filterManager.js` | Search/filter UI behavior |
| `public/js/lib/displayManager.js` | Query param building, quote list loading |
| `public/js/lib/settingsManager.js` | Settings load/save, settings panel UI |
| `public/js/lib/cryptoUtils.js` | Encryption/decryption |
| `public/js/lib/noteTypes.js` | Note type config, field visibility rules |
| `public/style.css` | Base — root vars, body, scrollbar, app-layout |
| `public/style.sidemenu.css` | Left-side menu |
| `public/style.search.css` | Search panel + filters + counters |
| `public/style.buttons.css` | Button variants + refresh animations |
| `public/style.modal.css` | Note-editor modal + form fields + score dice |
| `public/style.cards.css` | Note cards (grid + content + Quill text) |
| `public/style.selection.css` | Bulk-select mode + select-action-bar |
| `public/style.attachments.css` | Attachment uploads & viewers |
| `public/style.entities.css` | Author/source/tag cards, rename, tag-ops, notifications |
| `public/style.settings.css` | Settings page, type management |
| `public/style.dialogs.css` | Merge modal + custom confirm dialog |
| `public/style.views.css` | Gallery / list-pane / calendar / encryption UI / banners |
| `public/style.mobile.css` | All `max-width` @media queries |
| `public/style.small.css` | Portrait-phone overrides (loads after mobile) |
| `public/style.medium.css` | `(768px – 1100px)` @media queries |
| `public/js/lib/listPaneView.js` | List + detail pane layout |
| `public/js/lib/trainingCalendar.js` | Training calendar in list-pane left column |
| `public/js/lib/mergeModal.js` | Note merge UI |
| `public/js/lib/dedupSuspectsPanel.js` | Duplicate inspection (Options) |
| `config/settings.json` | Note types, training sub-types, colors, feature flags |
| `config/modes.json` | Mode → note type mappings |
