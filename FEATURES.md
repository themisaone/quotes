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

Types and their labels/icons are user-configurable in Settings. The `behavior` field determines which editor fields appear — you can add a new type with `behavior: 'quote'` to reuse Author/Source fields.

---

## Side Menu / Navigation

Left sidebar lists note types grouped by mode. Each type is a link that sets the URL hash and filters the card list.

- Expand arrows (▶) for types with sub-tags appear at the far right of the menu item
- Sub-tags are shown as indented child links
- The active view is highlighted
- URL hash encodes the current view: `#training`, `#note`, `#puzzle`, etc. Empty hash = DEFAULT view

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

**Attachment thumbnail:** Shown inline in card if present. Clicking opens the full attachment viewer or prompts for decryption if encrypted.

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

---

## Bulk Operations

Available from a bulk-select mode on the card grid:

- **Bulk tag** — add a tag to all selected notes
- **Bulk untag** — remove a tag from all selected notes
- **Bulk set group** — set `translation_group` on selected notes (for linking translations)
- **Bulk duplicate** — duplicate selected notes
- **Bulk delete** — delete selected notes (with confirmation)

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

Settings panel → Data Management:
- Export JSON backup
- Import JSON backup
- Export as PDF
- Export big files report
- Migrate attachments to disk (one-time tool, should no longer be needed)
