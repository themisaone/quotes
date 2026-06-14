# Feature Reference

---

## Note Types

Notes are typed. Type determines which fields appear in the editor modal and how the card looks.

**Types and behaviors:**

| Type | Behavior | Special fields |
|---|---|---|
| `quote` | `quote` | Author, Source, Score |
| `note` | `generic` | None beyond text + tags |
| `historical` | `generic` | None |
| `puzzle` | `generic` | None |
| `training` | `training` | Date, Training sub-type |
| `job` | `generic` (default) | Same as `note` unless you set `behavior: quote` or `training` in Settings |
| `tegneserie` | `generic` (default) | Comic-strip / series notes; optional welcome random note on load |

Types and their labels/icons are user-configurable in Settings. The `behavior` field determines which editor fields appear — you can add a new type with `behavior: 'quote'` to reuse Author/Source fields.

---

## Side Menu / Navigation

Left sidebar lists note types grouped by mode. Each type is a link that sets the URL hash and filters the card list. The menu can be collapsed with the ◀ toggle (desktop/medium). On phone-width screens (**≤767px**), the bottom bar uses **two dropdowns**: **note type** (when the mode has 2+ types) and **☰ Menu** (Authors, Sources, Tags, Services, Options, Random, Export/Import, etc.). Single-type instances hide the note-type dropdown. Sidebar icon rows are hidden on phone — the dropdowns replace them.

When a single-type instance is running (`npm run tegneserie`, etc.), Options → Note Types lists **only that type** (others remain in `settings.json` but are hidden).

**Services:** Sidebar → **Services** lists all configured note-type servers on this host (by port). Any running instance can start/stop others (including **This tab** — useful when there is no terminal) and open them in a new tab — useful when the app runs on a home server and you browse via Tailscale.

- Expand arrows (▶) for types with sub-tags appear at the far right of the menu item
- Sub-tags are shown as indented child links
- The active view is highlighted
- URL hash encodes the current view: `#training`, `#note`, `#puzzle`, etc. Empty hash = DEFAULT view

**Modes (which types appear):** Controlled by the mode selector, `config/modes.json`, and optionally the `MODE` environment variable (same values as `npm run …` in `README.md`). **Docker Compose** sets `MODE` to **`ALL` by default** (equivalent to `npm run all`); set `MODE` in `.env` to override (e.g. `MODE=DEFAULT`). If you use **`vaultPath`** in `local.json`, bind-mount that vault into the container at the same path (see **`DOCKER.md`**) or Docker will not see your vault `settings.json` (wrong colours / missing note types).

---

## Note Cards

Cards are displayed in a grid (1, 2, or 3 columns depending on screen width). Three visual sizes selectable in Settings.

**Card anatomy:**
- Training cards: sub-type + date on top, text, then tags + attachment
- All other cards: text, then author/source, then tags + attachment

**Card actions (via button strip on hover):**
- Edit (opens modal)
- Delete (with confirmation)
- Duplicate

**Column layout (Settings / toolbar):** 1, 2, or 3 columns on desktop; medium screens lock to 2 columns. **Gallery mode** shows only notes with image attachments, uses a larger page size, and forces image-related filters — toggled from the column-count control (`gallery` option).

**List + pane view:** Alternative to the card grid — compact list on the left, full note in the right pane (reuses the edit modal). **Training** notes always use this layout (no Cards option); **Calendar / List** is chosen from the page header (before **Add New**), same slot as **Cards / List + Pane** on other types. The left column has **no redundant type header** — the main page title already shows the context. Training **list** mode uses Year/Month filters in the search bar; **calendar** mode hides those (the calendar has its own month navigation). **All Notes** and every other type (except Training) toggle **Cards** vs **List + Pane** via **DISPLAY_MODE** in the header. List rows show title (or **No title**), one line of note text, optional **score** (right-aligned), **type / author / source** when set (card-style meta), and an optional **80×80px** thumbnail. Up to **12** notes per page in list-pane mode (minimum pane height matches a full page even when filters return fewer rows). Long note text scrolls inside the Quill editor. Select a note from the list to open it in the right pane (no Prev/Next bar). Pane layout: **title** (modal typography) with **score** dice (if set), **⚙ Properties**, and **💾 Save**; optional **group G** (clickable), **author/source** (or training date/type), and **tags** (right-aligned, clickable) on one row; **comment** below when set; an **attachment gallery** when present (all images up to **512px** each in one scrollable row, removable via **✕**; no empty-state box — **Add / Add more / Encrypt & attach** sit in the title row beside **Properties**), then an **inline Quill editor** (always shown — text can be added on image-only notes). **Properties** modal keeps the score row and a single separator below the title (attachments are managed in the pane, not Properties). **💾 Save** saves text only; switching notes with unsaved text prompts **Save / Don't save / Cancel**. Per-type view preference: `viewMode_all` or `viewMode_<type>`; training sub-mode: `lpTrainingSubMode` (`calendar` | `list`). Implemented in `listPaneView.js`, `paneEditor.js`, and `trainingCalendar.js`.

**Attachment thumbnail:** Shown inline in card if present. Clicking opens the full attachment viewer or prompts for decryption if encrypted.

**Welcome / random note:** On load, an overlay can show a random **quote** when the active mode includes `quote` (`default`, `all`, `npm run quotes`, etc.) — not in single-type modes like `tegneserie` or `job`. Menu **Random → Quote** and `GET /api/quotes/random` (default `note_type=quote`) follow the same rule. **Random → Tegneserie** requires `tegneserie` in the active mode.

---

## Note Editor Modal

Opens for both creating and editing notes. Fields shown depend on `note_type` behavior.

**Common fields:**
- Note type selector (changes which other fields are visible)
- Main text editor (Quill rich-text)
- Tags (autocomplete, comma-separated, multi-language supported)
- Comment / side-notes field
- Attachment panel

**Quote fields:**
- Author (autocomplete → author entity)
- Source (autocomplete → source entity)
- Source sub-type (book, movie, etc.)
- Score (numeric)

**Training fields:**
- Date picker (Norwegian format dd.mm.yyyy internally)
- Training sub-type (dropdown from settings)

**Attachment panel:**
- Shows current attachment with preview
- Multi-attachment strip when 2+ attachments
- Buttons: upload file, paste image, downscale large image, encrypt & attach, delete attachment
- Primary attachment mirrored to `notes` flat columns
- **HTML source** toggle — edit raw Quill HTML in a textarea (`htmlSourceViewer.js`)

---

## Tags

Tags are scoped to a note type. A note of type `quote` can only have `quote`-type tags; a `training` note uses `training`-type tags.

**Tag autocomplete** supports multi-language synonyms: `age | alder | gammel` is stored as one tag but all parts match during search.

**Tags page** (accessible from menu):
- Lists all tags with quote counts
- Click tag → filter notes by that tag
- Rename tag (merges if name already exists)
- Delete tag

---

## Authors & Sources

Authors and sources are entities — each has a name, optional image, and is linked to notes by foreign key.

**Author modal:** click an author name in a card or in the Authors page to open. Shows all linked notes count, editable name/image, delete if unused.

**Source modal:** same pattern. Source has an additional sub-type field (BOOK, MOVIE, PODCAST, etc.) driven by the source types list in settings.

---

## Search & Filtering

Search panel is collapsible, shown above the card grid.

**Filters:**
- Free text (searches note text, author, source)
- Author dropdown
- Source dropdown (with "Sources" sub-dropdown for quote type)
- Tags multi-select
- Score range
- Note date range
- Has attachment / has multiple attachments
- Training sub-type multi-select (shown for training filter)
- Note type badges (shown for ALL view)

**Active filter indicator:** Any field that has a value gets a light-blue background (CSS `:not(:placeholder-shown)` and `:has()` selectors, plus JS-applied `.has-value` class for selects and checkboxes).

**Clear button:** In the title row of the search panel, right-aligned.

---

## Hide Filters (Settings)

Two server-side note hiding settings:

### Hide Notes with Encrypted Attachments
Settings → Privacy → "Hide notes with encrypted attachments". When enabled, any note with `attachment_type='encrypted'` or a row in `note_attachments` with encrypted type is excluded from all listings and counts.

### Hide Notes with Tag
Settings → Privacy → "Hide notes with following tag: [input]". Enter any tag name (e.g. `hidden`). Notes tagged with that tag are excluded from all listings. Useful for archiving without deleting.

Both are passed to the API as `hideEncryptedNotes=true` and `hideTag=<name>` and applied as SQL subqueries. They do NOT affect export — export gets the raw data.

---

## Attachments

All attachments (except thumbnails) are stored on disk under `<vaultPath>/attachments/<note_type>/`.

**Supported types:**
- Images (jpg, png, gif, webp) — thumbnail generated and stored in DB
- Audio (mp3, wav, ogg, m4a)
- Video (mp4, webm, mov)
- PDF (rendered inline with pdf.js)
- Documents (any other file — shown with icon + filename)

**Multiple attachments per note:** stored in `note_attachments` table. The primary attachment (position=0) is mirrored to `notes.attachment_full`, `notes.attachment_type`, `notes.thumbnail` for backward compatibility. Additional attachments shown in a strip in the modal.

**Downscale:** Large images can be downscaled to 1024px via a button in the modal. The original file is replaced in-place on disk; the `file:` reference stays the same.

---

## Encrypted Attachments

Any attachment can be encrypted. Encryption is entirely client-side (browser).

**Encrypt:**
1. Click "🔒 Encrypt & attach" in the attachment panel
2. Select a file
3. Enter a password (and confirm)
4. File is encrypted client-side, uploaded as `.enc` file
5. Stored as `<noteId>.<origFilename>.enc`, `attachment_type='encrypted'`

**View/Decrypt:**
1. Click the 🔒 badge in a card or the lock thumbnail in the modal
2. Enter password
3. If correct → file opens in-browser (image viewer, audio player, PDF viewer, or text viewer depending on original extension)
4. If wrong password → decryption fails, error shown

**Algorithm:** AES-256-GCM, PBKDF2 key derivation (200,000 iterations, SHA-256). Salt (16 bytes) and IV (12 bytes) prepended to ciphertext.

---

## Export

**Data Management → Export**

Two files are generated:
1. **`backup_DATE.json`** — all notes with attachments ≤ size threshold embedded as base64. Notes with attachments above threshold get a `file:` reference instead.
2. **`big_files_DATE.txt`** — list of all note IDs + file paths that were too large to embed.
3. **`big_files_DATE.zip`** — zip of all those large files, named `<noteId>.<filename>`.

The size threshold is set in Settings → "Large attachment threshold (MB)". Default 2MB. Files above the threshold are excluded from the JSON but listed + zipped separately.

Import: POST the JSON to `/api/import/json`. Notes are created/updated; thumbnails and base64 attachments are written to disk. Big files must be re-imported manually (copy to `attachments/` folder and update the `file:` references).

---

## PDF Export

**Data Management → Export as PDF**

Uses Puppeteer (headless Chrome) to render notes and generate a PDF. Exports the currently filtered set of notes with formatting.
When selection mode is active and notes are selected, PDF export includes only those notes (from the side menu or the Select-Action-Bar). A confirmation dialog shows the note count and lets you choose **1 column** (default) or **2 columns**. Mixed-type exports use a flat layout with cover title/filename **Mixed notes**; author grouping (including **Unknown Author**) appears only for quote-only exports. Training notes show the type/date meta line. Notes without a title show **No title**.

---

## Bulk Operations

Available from a bulk-select mode on the card grid:

- **Bulk tag** — add a tag to all selected notes
- **Bulk untag** — remove a tag from all selected notes
- **Bulk set group** — set `translation_group` on selected notes (for linking translations)
- **Bulk set sub-type** — set the generic sub-type (`notes.type`, e.g. Pondus instead of Assorted) on selected notes; shown in the Select-Action-Bar dropdown when the current note type has sub-types configured (Tegneserie, Assorted Notes, etc.)
- **Bulk duplicate** — duplicate selected notes
- **Bulk split** — for notes with 2+ attachments: keep the original with attachment at position 0 only; create one new note per extra attachment (copies text, tags, author, etc.) — `POST /api/quotes/bulk-split`
- **Bulk delete** — delete selected notes (with confirmation)

---

## Note Merge

Combine multiple notes into one (`POST /api/notes/merge`, UI in `mergeModal.js`):

- Pick a **main** note; other selected notes are deleted after merge
- **Append texts** (default on): other bodies appended to main with `<hr>` dividers
- **Merge tags** (default on): union of tags onto main
- All attachments from other notes are re-assigned to main with new positions
- Available from bulk selection or from a **translation group** (“Merge group” button)
- `translation_group` is cleared on the surviving note

---

## Duplicate Inspection (Dedup)

**Options → Duplicate inspection** loads `GET /api/dedup/suspects` and shows groups of notes that share the same fingerprint (likely duplicates). Cards render in a dedicated grid (`dedupSuspectsPanel.js`). Use merge or manual cleanup from there.

---

## Translation Groups

Notes can be linked as translations of each other via `translation_group` (a shared string ID). In the editor modal, you can see linked translations and navigate between them.

---

## Color Customization

Settings → Colors. Nine UI elements are customizable (button color, card background, header, etc.). Colors are stored in `settings.json` and applied as CSS custom properties on page load. Pre-built palettes can be saved and loaded from `palettes/*.json`.

---

## Mode Selector

Bottom of the left sidebar. Switches which note types are visible without restarting the server. The selection is persisted in `config/local.json` and survives server restart.

---

## Vault Path

Settings → Storage → "Path to vault". When set, all attachment files and exported data go to `<vaultPath>/attachments/` and `<vaultPath>/exports/`. Intended for pointing at a Dropbox/Nextcloud synced folder. Stored in `config/local.json` (machine-local, not synced with DB).

---

## Data Management

Side menu → **Data Management** (desktop):
- Export JSON backup
- Import notes from JSON (including Backup Data exports)
- Export as PDF

**Options** page (⚙️) has two tabs: **General** (compact sections stacked on the left — tags, meta, maintenance, encryption; **Color Customization** top-right; **Note Display Options** and **Storage & Performance** side-by-side below) and **Note Types** (per-type cards). The active tab is remembered in `localStorage` (`settingsOptionsTab`). Each note type card shows labeled fields (icon, internal key, display label, edit-modal behavior, **Default display mode**, **Quick tag shortcuts** for that type) plus sub-types on the right. Display-mode defaults: **Cards / List + Pane** for most types, **Calendar / List** for Training (`defaultDisplayMode` in `settings.json`). Deleting a note type or sub-type, or removing a tag shortcut, prompts for confirmation.
- **Duplicate inspection** and **Prune unused metadata** — stacked with other compact General sections on the left; prune deletes authors, sources, and tags with zero linked notes (`POST /api/maintenance/prune-unused-entities`). Irreversible; confirm before running.
- Each option card shows the **section title** and controls at all times. Long explanatory text is under a **Description** disclosure (collapsed by default) in the header row.

Settings → **Storage & Performance** (Options page):
- Migrate attachments to disk (one-time tool, should no longer be needed)

**Vault tools (Options → Storage & Performance):** validate path, show disk usage (`GET /api/vault/info`), and optionally move attachment tree to a new vault folder (`POST /api/vault/move`).

---

## Entity Rename Auto-Merge

Renaming an author, source, or tag to a name that already exists **merges** into the existing entity (all note links move; duplicate row removed). Same pattern on `PUT /api/authors/:id`, `PUT /api/sources/:id`, and `PUT /api/tags/:id`.
