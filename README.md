# Misa Jokic Notes — Personal Knowledge Base

A personal note and quote management system built with Node.js/Express, PostgreSQL, and vanilla JavaScript. Supports multiple note types, rich text, file attachments (stored on disk), tagging, search, export/import, and attachment encryption.

---

## Quick Start

### Prerequisites
- Docker (recommended), **or** Node.js 18+ and PostgreSQL 14+

### Option A — Docker (recommended)

```bash
# 1. Copy env template and fill in your Postgres credentials
cp .env.example .env

# 2. Create the database (once, in psql as superuser)
sudo -u postgres psql
  CREATE USER notes_user WITH PASSWORD 'yourpassword';
  CREATE DATABASE notes_db OWNER notes_user;
  \q

# 3. Start (migrations run automatically)
docker compose up -d

# 4. Open  http://localhost:4000
```

### Option B — Node directly

```bash
npm install
cp .env.example .env   # fill in DB credentials
npm start              # runs migrations then starts server
```

---

## Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `DB_HOST` | Postgres host | `host.docker.internal` |
| `DB_PORT` | Postgres port | `5432` |
| `DB_NAME` | Database name | `notes_db` |
| `DB_USER` | Postgres user | `notes_user` |
| `DB_PASSWORD` | Postgres password | — |
| `PORT` | HTTP port | `4000` |

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
| `npm run brain` | BRAIN | custom set |

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
│   ├── server.js          # Express server + all API routes (~4800 lines)
│   ├── db.js              # PostgreSQL connection pool
│   ├── fileStorage.js     # Disk attachment helpers
│   └── tagHelpers.js      # Tag DB helpers
├── public/
│   ├── index.html         # Single-page HTML (~2000 lines)
│   ├── app.js             # Main frontend logic (~5200 lines)
│   ├── style.css          # All styles (~7000 lines)
│   └── js/lib/            # Frontend ES modules (see ARCHITECTURE.md)
├── migrations/
│   ├── 001_schema.js      # Full schema (safe to re-run)
│   └── run-migrations.js  # Migration runner
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
├── Dockerfile
└── .env.example
```

---

## Data Persistence

| Data | Location |
|---|---|
| Notes, tags, authors, sources | PostgreSQL |
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

All tables are created automatically by migrations on first start.

To share **your data**: export a JSON backup from Data Management → Export, then import on their machine. For notes with large file attachments, also copy the `attachments/` folder.

---

## Further Reading

- `DOCKER.md` — Docker setup details, Linux/Mac differences, common commands
- `ARCHITECTURE.md` — Code patterns, module system, data flow, gotchas
- `FEATURES.md` — All features documented with implementation notes
- `public/js/lib/README.md` — Frontend module reference
