# Running with Docker

The Docker image contains only the **Node.js app** (Node **22** on Alpine) — no database.  
You create and own your PostgreSQL database; the app connects to it via environment variables.

**Handing the app to a non-developer (Windows):** see **`DOCKER-FRIEND-WINDOWS.md`** and **`docker-compose.friend.example.yml`** (image-only compose, no `build:`).

---

## Prerequisites

- Docker with Compose (`docker compose`, v2 plugin)
- A running PostgreSQL instance (local on your machine, remote, or in its own container)
- A database and user created for the app

```sql
-- Run once in psql as a superuser:
CREATE USER notes_user WITH PASSWORD 'your_password';
CREATE DATABASE notes_db OWNER notes_user;
```

---

## Quick start

```bash
# 1. Copy the env template and fill in your DB credentials
cp .env.example .env

# Important: if Postgres runs on the SAME machine as Docker (not inside Compose),
# set DB_HOST=host.docker.internal in .env — NOT localhost (inside the container,
# localhost is the container itself).

# 2. Build and start
docker compose up -d

# 3. Open the app
open http://localhost:4000   # macOS
# xdg-open http://localhost:4000   # many Linux desktops
```

The entrypoint waits until Postgres answers `pg_isready`, runs migrations, then starts the server.

---

## Configuration files (on your host machine)

The compose file bind-mounts `./config` and `./attachments`. Edit files on the host, then:

```bash
docker compose restart app
```

| File | What it controls |
|------|------------------|
| `.env` | DB host/port/name/user/password, HTTP host port mapping, optional `MODE` (Compose defaults to **`ALL`** if unset — same as `npm run all`) |
| `config/settings.json` | Note types, colours — used when there is **no** `vaultPath`; otherwise the app uses **`<vaultPath>/config/settings.json`** (see below) |
| `config/local.json` | Active mode and **`vaultPath`** (optional). If `vaultPath` points at a host folder, that folder must be **bind-mounted** into the container at the **same path** when using Docker. |
| `config/modes.json` | Mode → note type mappings (optional; built-in defaults apply if missing) |

---

## Vault path (`local.json`) and Docker

If `local.json` sets **`vaultPath`** (e.g. `/home/you/Dropbox/.../MainNoteArchiveVault`), the server loads **`settings.json`** from **`<vaultPath>/config/`**, palettes from the vault, and attachments from **`<vaultPath>/attachments/`**.

The container filesystem does **not** include your host home directory unless you mount it. Without a bind mount, Docker may create an **empty** tree at that path inside the container (wrong `settings.json` size, missing `palettes/`, etc.).

**Recommended:** copy the example override and set your vault path (must match `vaultPath` in `local.json` **exactly** — same string on left and right of `:`):

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
# Edit docker-compose.override.yml — replace /home/YOU/... with your real vault path
docker compose up -d --build --force-recreate
```

Compose **automatically merges** `docker-compose.override.yml` with `docker-compose.yml` (the override file is gitignored so each machine keeps its own path).

Alternatively, add the same single line under `app.volumes` in `docker-compose.yml` yourself (not ideal for sharing the repo).

Then run `docker compose up -d --build --force-recreate`. At startup, if the vault path is missing, the server logs a **warning** suggesting Docker bind-mount.

**Check what the container actually resolves:** open **`http://localhost:4000/api/vault/info`** in a browser (or `curl` it). Inspect **`vaultRootExists`**, **`settingsFileExists`**, **`settingsFile`**, and **`settingsNoteTypeCount`**. If `settingsFileExists` is false, the path is wrong, the mount does not match `vaultPath`, or the folder layout is different (on Linux, **`config` vs `Config`** matters).

**Browser `localStorage`:** A legacy one-time migration could overwrite **colours** in `settings.json` from old `localhost` keys when switching to Docker. The app now **skips** that migration when the server returns any note type beyond the four built-in defaults (`quote`, `note`, `training`, `puzzle`). If the UI still looks wrong, clear **site data** for this origin (or set `localStorage.setItem('settingsMigratedToFile','done')` in DevTools), then hard-refresh.

---

## Connecting to Postgres on the host

Use **`DB_HOST=host.docker.internal`** in `.env` when PostgreSQL listens on your machine and the app runs in Docker.

This repository’s `docker-compose.yml` already includes:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

That makes `host.docker.internal` resolve correctly on **Linux** (Docker Engine). On **Docker Desktop** (macOS / Windows), the hostname is available as well; the extra entry is redundant there but harmless.

---

## `MODE` in Docker

`docker-compose.yml` sets **`MODE=${MODE:-ALL}`** — so containers match **`npm run all`** unless you override in `.env` (e.g. `MODE=DEFAULT`, `MODE=QUOTES`, …).

When `MODE` is set in the environment, it wins over `config/local.json` for startup (same priority as `npm run <mode>`). After start, the in-app mode selector still updates `local.json`, but the next container restart will apply `.env` again unless you align them.

---

## Sharing with another user

### Option 1 — project folder (recommended)

Send a copy of the project **without** `.git` if you like. They need at least:

- `docker-compose.yml`, `Dockerfile`, `docker/entrypoint.sh`, `.dockerignore`
- `package.json`, `package-lock.json`, source tree (`src/`, `public/`, `migrations/`, `scripts/`, …)
- `.env.example` → they copy to `.env` and set credentials (and `DB_HOST=host.docker.internal` if DB is on host)

Compose creates or uses `./config` and `./attachments` on the host. An **empty** `config/` is enough for a first run: missing `modes.json` uses code defaults; `settings.json` is created when settings are first read. To ship your **custom** mode definitions, include your `config/modes.json` (and any `settings.json` you rely on).

### Option 2 — image from a registry

Build and push (example names):

```bash
docker build -t yourname/misa-quotes:latest .
docker push yourname/misa-quotes:latest
```

The receiver needs a **compose file** that references your image (e.g. `image: yourname/misa-quotes:latest` and drop or keep `build: .` only for local dev), plus `.env`, `config/`, and `attachments/` as above. They do **not** need the full source tree if the image is pulled — but they still need the **same** `docker-compose.yml` (or equivalent) for ports, env, and volumes.

---

## Common commands

```bash
docker compose up -d              # start in background
docker compose logs -f app        # follow app logs
docker compose restart app        # restart after config change
docker compose down               # stop and remove containers
docker compose up -d --build      # rebuild image after code changes
```

---

## Data persistence

| Data | Where it lives |
|------|----------------|
| Database rows | Your own Postgres |
| Uploaded attachments | `./attachments/` on your host |
| Settings | `config/settings.json` (or vault path in `local.json`) |

---

## Image contents (reference)

The `Dockerfile` copies `package*.json`, runs `npm ci --omit=dev`, then copies `src/`, `migrations/`, `public/`, `scripts/`, `config/`, and `docker/entrypoint.sh`. Runtime config and uploads come from the bind mounts, not from layers baked at build time for those paths.
