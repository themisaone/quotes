# Misa's' Notes — Personal Knowledge Base

A personal note and quote management system built with Node.js/Express, PostgreSQL, and vanilla JavaScript. Supports multiple note types, rich text, file attachments (stored on disk), tagging, search, export/import, and attachment encryption.

---

## Quick Start

### Prerequisites
- Docker (recommended), **or** Node.js 18+ and PostgreSQL 14+ (the `Dockerfile` uses **Node 22**)

### Option A — Docker (recommended)

```bash
# 1. Copy env template and fill in your Postgres credentials
cp .env.example .env

# If Postgres runs on the same machine as Docker (typical), set in .env:
#   DB_HOST=host.docker.internal
# (localhost inside the container is the container itself, not your host.)

# 2. Create the database (once, in psql as superuser)
sudo -u postgres psql
  CREATE USER notes_user WITH PASSWORD 'yourpassword';
  CREATE DATABASE notes_db OWNER notes_user;
  \q

# 3. Start (migrations run automatically)
docker compose up -d

# 4. Open  http://localhost:4000
```

Details, Linux/macOS notes, **vault bind-mount** (`docker-compose.override.example.yml` → `docker-compose.override.yml` when using `vaultPath`), and image-only sharing: **`DOCKER.md`**.

### Option B — Node directly

```bash
npm install
cp .env.example .env   # fill in DB credentials
npm test                # optional: run lightweight automated checks
npm start              # checks pending migrations, then starts server
```

---

## Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `DB_HOST` | Postgres host | `localhost` (native Node); use **`host.docker.internal`** when the app runs in Docker and Postgres is on the host |
| `DB_PORT` | Postgres port | `5432` |
| `DB_NAME` | Database name | `notes_db` |
| `DB_USER` | Postgres user | `notes_user` |
| `DB_PASSWORD` | Postgres password | — |
| `PORT` | HTTP port | `4000` |
| `MODE` | Startup note-type mode (`DEFAULT`, `ALL`, `QUOTES`, …) | **Docker:** defaults to **`ALL`** via Compose unless you set `MODE` in `.env`. **Native Node:** unset → `config/local.json` / UI |

---

## Mode System

The app supports **modes** that control which note types are visible. Set via the `MODE` env var or the UI mode selector.

| npm script | MODE | Visible types |
|---|---|---|
| `npm start` | DEFAULT | quote, note, historical |
| `npm run all` | ALL | all types |
| `npm run quotes` | QUOTES | quote only |
| `npm run training` | TRAINING | training only |
| `npm run notes` | NOTES | note only |
| `npm run historical` | HISTORICAL | historical only |
| `npm run brain` | BRAIN | puzzle only |
| `npm run job` | JOB | job only |
| `npm run tegneserie` | TEGNESERIE | tegneserie only |

Each `npm run …` script sets a fixed **PORT** so you can run several instances at once (same database). See the port table below.

| npm script | Port |
|---|---|
| `npm start` / `default` / `all` | 4000 |
| `tegneserie` | 4001 |
| `training` | 4002 |
| `job` | 4003 |
| `brain` | 4004 |
| `quotes` | 4005 |
| `notes` | 4006 |
| `historical` | 4007 |

Ports are defined in `config/instance-ports.json` (shared by `npm run …` and the **Services** UI).

### Services UI (multi-instance on one host)

From any running instance, open **Services** in the sidebar to see which note-type servers are up, **Start** another (e.g. Tegneserie while Job is running), **Open** in a new tab, or **Stop** any service — including the one you are viewing (**This tab**), e.g. when it has no terminal window. Works over Tailscale — start/stop runs on the server machine; links use your current hostname.

Disable spawning with `INSTANCE_MANAGER=0` in `.env`. Only use on a trusted network (home / Tailscale).

**Stuck instance (no terminal):** Services → **Stop** on **This tab**. If you still see an old “cannot stop from itself” message, the running Node process predates that fix — over SSH: `kill $(lsof -t -iTCP:PORT -sTCP:LISTEN)` (use the port from Services, e.g. 4003), pull latest code, start again.

Modes are defined in `config/modes.json`. Active mode persists in `config/local.json`.

---

## Note Types

Configured in `config/settings.json` under `noteTypes`. Each type has:
- `value` — internal key (`quote`, `training`, `note`, `puzzle`, `historical`)
- `icon` — emoji
- `label` — display name
- `behavior` — which fields to show (`quote` | `training` | `generic`)

**Behavior `quote`**: shows Author, Source, Score fields  
**Behavior `training`**: shows Date, Training Sub-type fields  
**Behavior `generic`**: shows only the text editor

Training sub-types are configured under `trainingTypes` in `settings.json`.

---

## File Layout

```
quotes/
├── src/
│   ├── server.js          # Express server startup, static serving, and route registration (~350 lines)
│   ├── db.js              # PostgreSQL connection pool
│   ├── attachmentFolders.js # Attachment folder normalization helpers
│   ├── attachmentRehome.js # Attachment folder drift planner/apply helper
│   ├── entityPayload.js   # Author/source image payload helpers
│   ├── entityQueries.js   # Author/source query and response helpers
│   ├── exportImportHelpers.js # JSON export/import helper behavior
│   ├── fileStorage.js     # Disk attachment helpers
│   ├── modeConfig.js      # Startup mode resolution helpers
│   ├── noteText.js        # Note text cleanup helpers
│   ├── quoteAttachmentSync.js # Quote create/update attachment sync helpers
│   ├── quoteListQuery.js  # Quote count/list/bulk filter SQL builders
│   ├── quoteMetadata.js   # Quote author/source/tag/scalar update helpers
│   ├── quoteResponse.js   # Quote attachment/tag response enrichment helpers
│   ├── tagHelpers.js      # Tag DB helpers
│   ├── transactionResponses.js # Transaction rollback response helpers
│   └── routes/
│       ├── attachmentMigration.js # Attachment disk migration route
│       ├── attachments.js # Note attachment CRUD/upload/primary routes
│       ├── authors.js     # Author entity API routes
│       ├── dbAttachmentExport.js # DB-stored attachment export route
│       ├── dedup.js       # Duplicate inspection routes
│       ├── exportImport.js # JSON export/import routes
│       ├── instances.js   # Multi-instance Services API routes
│       ├── maintenance.js # Maintenance inspection/apply routes
│       ├── mode.js        # Mode status/switching routes
│       ├── palettes.js    # Saved color palette routes
│       ├── pdfExport.js   # PDF export routes and HTML rendering helpers
│       ├── quoteBulk.js   # Quote bulk selection/action routes
│       ├── quotes.js      # Quote read/create/update/delete/translation/merge routes
│       ├── settings.js    # Settings load/save routes
│       ├── sources.js     # Source entity API routes
│       ├── tags.js        # Tag browse/rename/delete/bulk-add routes
│       ├── uploads.js     # Direct upload route + Multer helpers
│       └── vault.js       # Vault info, validation, and copy routes
├── tests/                 # Node test-runner tests (no live DB required)
├── public/
│   ├── index.html         # Single-page HTML (~2000 lines)
│   ├── app.js             # Main frontend logic (~4800 lines)
│   ├── style.css          # Base — root vars, body, scrollbar, app-layout
│   ├── style.sidemenu.css # Left-side menu
│   ├── style.search.css   # Search panel + filters + counters
│   ├── style.buttons.css  # Button variants
│   ├── style.modal.css    # Note-editor modal + form fields
│   ├── style.cards.css    # Note cards (grid + content + Quill text)
│   ├── style.selection.css     # Bulk-select mode
│   ├── style.attachments.css   # Attachment uploads & viewers
│   ├── style.entities.css      # Authors / sources / tags / rename / tag-ops
│   ├── style.settings.css      # Settings page
│   ├── style.dialogs.css       # Merge modal + confirm dialog
│   ├── style.views.css         # Gallery / list-pane / calendar / encryption UI
│   ├── style.mobile.css        # @media (max-width: …) overrides
│   ├── style.small.css         # portrait-phone overrides (after mobile)
│   ├── style.medium.css        # @media (768–1100px) overrides
│   └── js/lib/            # Frontend ES modules (see ARCHITECTURE.md)
├── migrations/
│   ├── 001_schema.js      # Full schema baseline
│   ├── 002_note_title.js  # note_title column migration
│   └── run-migrations.js  # Pending-migration runner
├── config/
│   ├── settings.json      # User settings, note types, colors (auto-created)
│   ├── local.json         # Vault path + active mode (machine-local)
│   └── modes.json         # Mode → note type mappings
├── attachments/           # All uploaded files (mounted as Docker volume)
│   ├── quote/
│   ├── note/
│   ├── training/
│   └── ...
├── palettes/              # Saved color palettes (JSON files)
├── docker-compose.yml
├── docker-compose.friend.example.yml   # image-only compose for friends (no Git/build)
├── Dockerfile
└── .env.example
```

---

## Data Persistence

| Data | Location |
|---|---|
| Notes, tags, authors, sources | PostgreSQL |
| Applied migration history | PostgreSQL `schema_migrations` table |
| Thumbnails | PostgreSQL (base64 in `notes.thumbnail`) |
| All other attachments | `./attachments/<type>/` on disk |
| Settings & note type config | `config/settings.json` |
| Machine-local config | `config/local.json` |
| Color palettes | `<vaultPath>/palettes/*.json` (falls back to `./palettes/` if vault path not configured) |

---

## Sharing with a Colleague

See `DOCKER.md` for full instructions. Short version:

1. They create a Postgres database and user
2. Copy the project folder to their machine
3. `cp .env.example .env` and fill in their DB credentials
4. `docker compose up -d`

All tables are created automatically by pending migrations on first start.

To share **your data**: export a JSON backup from Data Management → Export, then import on their machine. For notes with large file attachments, also copy the `attachments/` folder.

---

## Further Reading

- `.cursor/rules/project-context.mdc` — Cursor rule: read the docs below before substantial work
- `DOCKER.md` — Docker setup details, Linux/Mac, vault, Postgres, common commands
- `DOCKER-FRIEND-WINDOWS.md` — **Short hand-off guide** for a non-developer on **Windows** (image + zip layout + `.env`)
- `ARCHITECTURE.md` — Code patterns, module system, data flow, gotchas
- `FEATURES.md` — All features documented with implementation notes
- `scripts/README.md` — CLI utilities (imports, DB scripts, backup splitter)
- `scripts/safe-housekeeping/README.md` — Re-runnable DB tidy-ups (e.g. H2 → title)
- `scripts/done-once/README.md` — Archival one-shot tools (CSS splitters)
- `public/js/lib/README.md` — Frontend module reference
