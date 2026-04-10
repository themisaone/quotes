# Running with Docker

The Docker image contains only the **Node.js app** — no database.  
You create and own your PostgreSQL database; the app connects to it via environment variables.

---

## Prerequisites

- Docker installed
- A running PostgreSQL instance (local, remote, or in its own container)
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

# 2. Build and start
docker compose up -d

# 3. Open the app
open http://localhost:4000
```

The app will wait for Postgres to be reachable, run migrations automatically
(creating tables if they don't exist), then start serving.

---

## Configuration files (on your host machine)

| File | What it controls |
|------|-----------------|
| `.env` | DB host/port/name/user/password, HTTP port |
| `config/settings.json` | Note types, sub-types, UI preferences |

Both are mounted into the container as volumes — edit them on your host,
then restart the app to pick up changes:

```bash
docker compose restart app
```

---

## Connecting to Postgres on your own machine

On **Linux** add this to the `app` service in `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Then set `DB_HOST=host.docker.internal` in `.env`.

On **macOS / Windows** `host.docker.internal` works out of the box — no extra config needed.

---

## Sharing the image with another user

Option 1 — **send the whole project folder** (recommended):

```bash
# Receiver runs:
cp .env.example .env        # edit with their DB credentials
# optionally edit config/settings.json for their note types
docker compose up -d
```

Option 2 — **push to Docker Hub / registry** and have them pull just the image:

```bash
# Build and tag
docker build -t yourname/misa-quotes:latest .

# Push
docker push yourname/misa-quotes:latest
```

The receiver needs only `docker-compose.yml`, `.env.example`, and an empty `config/` folder.

---

## Common commands

```bash
docker compose up -d            # start in background
docker compose logs -f app      # follow app logs
docker compose restart app      # restart after config change
docker compose down             # stop and remove containers
docker compose up -d --build    # rebuild after code changes
```

---

## Data persistence

| Data | Where it lives |
|------|---------------|
| Database rows | Your own Postgres — fully under your control |
| Uploaded attachments | `./attachments/` on your host |
| Settings | `./config/settings.json` on your host |
