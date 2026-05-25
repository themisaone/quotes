# Misa Notes — Docker setup for a friend (Windows)

This guide is for **someone who receives a zip from you** and only needs to run the app in Docker — **no Git, no Node, no Postgres install** (Postgres still has to exist somewhere they can reach).

---

## Part A — What **you** (the distributor) prepare

### 1. A Docker image they can run

Pick **one** of these:

| Method | What you do | What the friend does |
|--------|-------------|------------------------|
| **Registry (recommended)** | `docker build -t yourname/misa-quotes:1.0 .` then `docker push yourname/misa-quotes:1.0` (Docker Hub, GitHub Container Registry, etc.) | `docker compose pull` |
| **USB / cloud file** | `docker save yourname/misa-quotes:1.0 -o misa-quotes-1.0.tar` | Install Docker Desktop, then `docker load -i misa-quotes-1.0.tar` |

Use a **tag** (e.g. `:1.0`) so you can send updates later.

### 2. A small zip folder (example layout)

Send a folder (zip it) containing at least:

| Item | Purpose |
|------|--------|
| `docker-compose.yml` | Start from **`docker-compose.friend.example.yml`** in this repo: set `image:` to your pushed image, rename to `docker-compose.yml`. |
| `.env.example` → they copy to **`.env`** | Database URL + password (see below). |
| **`config/`** folder | At minimum: `modes.json` (from your repo). They will get `local.json` and `settings.json` when the app runs, or you include templates **without** your private data. |
| **`attachments/`** | Empty folder is fine (Docker may need it to exist). |
| **`docker-compose.override.example.yml`** | Optional; only if they use a **vault** folder on disk — they copy to `docker-compose.override.yml` and edit paths (see Part B). |
| **`DOCKER-FRIEND-WINDOWS.md`** | This file. |

They do **not** need the full Git repo, `Dockerfile`, or `src/` if they only **pull** your image.

### 3. PostgreSQL for your friend

The app **does not** bundle Postgres. Your friend needs **either**:

- **Postgres in the cloud** (Neon, Supabase, RDS, …) — you give them host, port, DB name, user, password; they put them in `.env`, **or**
- **Postgres on their PC** (installer) — they create a database + user; in `.env` use `DB_HOST=host.docker.internal` so the **container** can reach Postgres on Windows.

You can add a second `postgres:` service to Compose later; this guide keeps it simple (external DB only).

---

## Part B — What your **friend** does (Windows)

### 1. Install Docker Desktop

1. Download **Docker Desktop for Windows**: https://www.docker.com/products/docker-desktop/
2. Run the installer; when asked, enable **WSL 2** backend (default on recent Windows).
3. Restart if prompted; start **Docker Desktop** and wait until it says **Running** (whale icon in the tray).

They do **not** need WSL/Linux skills — Desktop includes everything.

### 2. Unzip your folder

Example: unzip to `C:\Users\TheirName\MisaNotes\`.

Avoid paths with spaces if possible (simpler for `.env` and vault mounts).

### 3. Create `.env`

1. Copy `.env.example` to `.env`.
2. Open `.env` in **Notepad** (or VS Code).
3. Fill in database settings (you must give them real values):

```env
DB_HOST=host.docker.internal
DB_PORT=5432
DB_NAME=notes_db
DB_USER=notes_user
DB_PASSWORD=the_password_you_chose_for_them

PORT=4000
```

- If Postgres is **in the cloud**, replace `DB_HOST` with the hostname the provider gives (often **not** `host.docker.internal`).
- **`DB_HOST=host.docker.internal`** is correct when Postgres runs **on the same Windows PC** as Docker Desktop.

### 4. (Optional) Vault folder on their PC

If they use a **vault** (same idea as you: one folder with `config/`, `attachments/`, `palettes/`):

1. Copy `docker-compose.override.example.yml` to **`docker-compose.override.yml`**.
2. Edit the volume line so **both** sides are the **same Windows path**, using **forward slashes**, e.g.:

```yaml
services:
  app:
    volumes:
      - C:/Users/TheirName/MisaVault:C:/Users/TheirName/MisaVault:rw
```

3. In `config/local.json`, set **`vaultPath`** to that exact path string (same as on the left of `:`).

If they **do not** use a vault, they can skip this; attachments then use the `./attachments` folder next to the compose file.

### 5. Start the app

Open **PowerShell** or **Command Prompt**, `cd` into the folder that contains `docker-compose.yml`, then:

```bat
docker compose pull
docker compose up -d
```

First start may take a minute (image download).

### 6. Open the app in the browser

**http://localhost:4000**  
(if they changed `PORT` in `.env`, use that port instead.)

### 7. Useful commands (when something goes wrong)

```bat
docker compose ps
docker compose logs -f app
docker compose restart app
docker compose down
```

---

## Troubleshooting (short)

| Problem | What to check |
|--------|----------------|
| “Cannot connect to database” | `.env` credentials; Postgres running; for local Postgres use `DB_HOST=host.docker.internal`. |
| Blank / wrong theme or note types | Vault path and **override** mount must match `vaultPath` in `local.json` exactly. |
| Port already in use | Change `PORT` in `.env` (e.g. `4001`) and the `ports:` mapping in compose, or stop the other program using 4000. |

---

## Legal / practical note

Only distribute images and data you have the right to share. If the image contains only **your** app code (this project’s license), that is separate from **their** database and notes content.

---

## Where this fits in the repo

- **`docker-compose.friend.example.yml`** — image-only compose for a minimal hand-off (copy/rename, set `image:`).
- **`DOCKER.md`** — full technical detail (Linux, vault, Postgres).
- **`README.md`** — project overview and developer setup.
