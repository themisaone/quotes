# Architecture & Developer Guide

Everything a new session (or developer) needs to understand how this codebase works, including the non-obvious patterns and known gotchas.

---

## Overview

Single-user personal note app. Node.js/Express backend with a PostgreSQL database. Frontend is a vanilla JavaScript SPA (no framework) using native ES modules. No build step — files are served directly by Express.

---

## Backend (`src/server.js`)

One large file (~4800 lines) containing all Express routes. Split into logical sections by comments.

**Key globals:**
```js
_allowedTypes   // array of note_type strings currently visible (set by active mode)
_modeName       // e.g. 'DEFAULT', 'ALL', 'TRAINING'
```

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

**File naming convention:**
- Normal: `<noteId>.<originalFilename>` (e.g. `5236.photo.jpg`)
- Encrypted: `<noteId>.<originalFilename>.enc` (e.g. `5236.doc.txt.enc`)
- Legacy (pre-migration): `<noteId>_full.<ext>` (still supported for reading)

**Serving attachments:** Express serves `GET /attachments/*` from `fileStorage.getAttachmentsDir()` which is set from `config/local.json` → `vaultPath` + `/attachments`. If vault path is not set, defaults to `./attachments/` relative to app root.

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

The `/api/quotes` and `/api/quotes/count` endpoints accept these filter params that are applied as SQL WHERE clauses:

| Param | Effect |
|---|---|
| `hideEncryptedNotes=true` | Excludes notes with `attachment_type='encrypted'` or any encrypted note_attachment |
| `hideTag=<tagname>` | Excludes notes tagged with the given tag (case-insensitive) |
| `hasImage=true/false` | Filter by attachment presence |
| `hasImageType=true/false` | Filter by image-type attachment |
| `hasMultipleAttachments=true/false` | Filter by attachment count |
| `quote`, `author`, `source`, `tags`, `score` | Text search |
| `note_type` | Filter by note type |
| `types` | Filter by quote sub-types |
| `training_types` | Filter by training sub-types |

---

## Medium-Screen Layout (768px – 1100px)

A dedicated media query in `style.css` (~line 3172) overrides font sizes using `--m-font-*` variables (e.g. `--m-font-base: 0.75rem`, `--m-font-xl: 1.0rem`). These are *separate* from the desktop `--d-font-*` variables. The card grid is locked to 2 columns on medium screens.

**Adding medium overrides:** Always put them inside the `@media (min-width: 768px) and (max-width: 1100px)` block and use `!important` (the same pattern as existing rules in that block).

---

## Key Files Quick Reference

| File | What to edit |
|---|---|
| `src/server.js` | API routes, DB queries, file handling |
| `public/app.js` | Modal logic, card click handlers, main event wiring |
| `public/js/lib/cardRenderer.js` | Card HTML generation |
| `public/js/lib/modalRenderer.js` | Modal field population |
| `public/js/lib/filterManager.js` | Search/filter UI behavior |
| `public/js/lib/displayManager.js` | Query param building, quote list loading |
| `public/js/lib/settingsManager.js` | Settings load/save, settings panel UI |
| `public/js/lib/cryptoUtils.js` | Encryption/decryption |
| `public/js/lib/noteTypes.js` | Note type config, field visibility rules |
| `public/style.css` | All styles (desktop top, medium breakpoint ~line 3172) |
| `config/settings.json` | Note types, training sub-types, colors, feature flags |
| `config/modes.json` | Mode → note type mappings |
