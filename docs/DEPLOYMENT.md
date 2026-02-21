# Deployment Guide

## Overview

This guide covers deploying the Quotes Database application to Railway (or similar platforms).

## Railway Deployment

### Prerequisites

1. A Railway account ([railway.app](https://railway.app))
2. Railway CLI installed (optional, but recommended)
3. GitHub repository with your code

### Step 1: Prepare Your Repository

Ensure your `.gitignore` includes:

```
node_modules/
.env
*.log
.DS_Store
scripts/
```

Commit and push your code to GitHub.

### Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your quotes repository
5. Railway will auto-detect it's a Node.js app

### Step 3: Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically provision a PostgreSQL instance
4. It will create a `DATABASE_URL` environment variable

### Step 4: Configure Environment Variables

Railway should automatically set:

- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Application port (Railway manages this)

No additional configuration needed!

### Step 5: Run Database Migrations

**Option A: Using Railway CLI (Recommended)**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run migrations
railway run npm run migrate
```

**Option B: Manual via Railway Dashboard**

1. Go to your Railway project
2. Click on your service
3. Go to "Settings" → "Deploy"
4. Add a "Build Command" or use the terminal in Railway dashboard:
   ```bash
   npm run migrate
   ```

**Option C: Add to package.json scripts**

Update `package.json` to run migrations on deployment:

```json
{
  "scripts": {
    "start": "node src/server.js",
    "build": "npm run migrate",
    "migrate": "node migrations/run-migrations.js"
  }
}
```

Railway will run `build` before starting the app.

### Step 6: Deploy

Railway will automatically deploy when you push to GitHub.

You can also manually trigger a deployment from the Railway dashboard.

### Step 7: Access Your App

Railway will provide a public URL like:

```
https://your-app-name.railway.app
```

## Migration Strategy

### For Fresh Deployments (Railway, new environments)

The migration runner (`npm run migrate`) will execute migrations in order:

1. **001_initial_schema.js** - Creates all tables from scratch
2. **003_books_to_sources.js** - Skipped (checks if old 'books' table exists)
3. **004_add_type_to_quotes.js** - Skipped (checks if 'type' column exists)

### For Existing Databases (Your local dev)

If you already have data:

- 001 will use `CREATE TABLE IF NOT EXISTS` (safe to run)
- 003 and 004 will skip if already migrated

### Migration Files

```
migrations/
├── 001_initial_schema.js      # Fresh deployment: creates all tables
├── 003_books_to_sources.js    # Incremental: only for existing DBs
├── 004_add_type_to_quotes.js  # Incremental: only for existing DBs
└── run-migrations.js          # Runner: executes all in order
```

## Environment Variables

### Required

- `DATABASE_URL` - PostgreSQL connection string
  - Format: `postgresql://user:password@host:port/database`
  - Railway sets this automatically

### Optional

- `PORT` - Server port (default: 4000)
  - Railway sets this automatically

### Example `.env` (Local Development)

```env
DATABASE_URL=postgresql://username:password@localhost:5432/quotes
PORT=4000
```

## Troubleshooting

### Migration Fails on Railway

**Check logs:**

```bash
railway logs
```

**Connect to Railway DB directly:**

```bash
railway connect postgres
```

Then run SQL manually if needed.

### Database Connection Issues

Ensure `DATABASE_URL` is set:

```bash
railway variables
```

### App Won't Start

Check that:

1. `npm run migrate` completed successfully
2. `DATABASE_URL` is set
3. All dependencies are in `package.json` (not devDependencies)

## Post-Deployment Checklist

✅ Database migrations ran successfully  
✅ App starts without errors  
✅ Can access the web interface  
✅ Can create/read/update/delete quotes  
✅ Images upload correctly  
✅ Search and filters work

## Rollback Strategy

If deployment fails:

1. **Database rollback** - Railway keeps automatic backups
2. **Code rollback** - Use Railway's "Redeploy" with previous commit
3. **Start fresh** - Delete Railway project and start over

## Continuous Deployment

Every push to `main` branch will:

1. Trigger Railway deployment
2. Run `npm install`
3. Run `npm run build` (migrations)
4. Start app with `npm start`

## Cost

Railway offers:

- **Free tier**: $5/month credit (enough for small apps)
- **Pro tier**: $20/month + usage

PostgreSQL database counts toward usage.

## Security

Railway automatically provides:

- HTTPS
- Environment variable encryption
- DDoS protection
- Regular backups

**Never commit** `.env` file or expose `DATABASE_URL`!

## Alternative Platforms

This setup also works with:

- **Heroku** - Similar workflow, add Heroku PostgreSQL addon
- **Render** - Similar workflow, native PostgreSQL support
- **Fly.io** - Requires `fly.toml` configuration
- **DigitalOcean App Platform** - Similar workflow

Adjust environment variables and deployment commands accordingly.
