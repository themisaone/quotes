# Backup & Restore Feature

## Overview

The JSON Backup/Restore feature provides a complete data export and import system for your quotes database. This ensures you can:

- ✅ Create full backups of all your data
- ✅ Restore data to a new/empty database
- ✅ Migrate data between instances
- ✅ Recover from data loss

## Features

### Export (Backup)

- **Complete data export**: All quotes, authors, sources
- **Includes everything**: Images (base64), tags, notes, timestamps, types
- **JSON format**: Human-readable, easy to inspect/edit
- **Timestamped filename**: `quotes_backup_2026-02-21.json`

### Import (Restore)

- **Smart duplicate handling**: Choose to replace or skip existing entries
- **Transaction-based**: All-or-nothing import (rollback on errors)
- **Detailed statistics**: Shows created/updated/skipped counts
- **Error reporting**: Lists any items that failed to import
- **Safe**: Validates data structure before importing

## How to Use

### Creating a Backup

1. Click **"💾 Backup Data"** button in the header
2. JSON file downloads automatically
3. Store it safely (cloud storage, external drive, etc.)

**File contains:**

```json
{
  "version": "1.0",
  "exportedAt": "2026-02-21T14:30:00.000Z",
  "counts": {
    "authors": 45,
    "sources": 78,
    "quotes": 529
  },
  "data": {
    "authors": [...],
    "sources": [...],
    "quotes": [...]
  }
}
```

### Restoring from Backup

1. Click **"📥 Restore Data"** button
2. Choose import mode:
   - ✅ **Replace existing** (default): Updates existing entries if found
   - ⬜ **Skip duplicates**: Only imports new entries
3. Click **"Select Backup File"**
4. Choose your `.json` backup file
5. Confirm the import
6. Wait for completion (progress shown)
7. Page auto-refreshes with restored data

**Import Results Example:**

```
✅ Import Completed!

Authors: 12 created, 5 updated, 28 skipped
Sources: 8 created, 3 updated, 67 skipped
Quotes: 45 created, 15 updated, 469 skipped

Errors: 0
```

## Use Cases

### 1. Regular Backups

Create weekly/monthly backups before making major changes.

```
quotes_backup_2026-02-01.json
quotes_backup_2026-02-15.json
quotes_backup_2026-03-01.json
```

### 2. Database Migration

Move from Railway to another hosting platform:

1. Export from Railway instance
2. Deploy new instance
3. Run migrations
4. Import backup file

### 3. Data Recovery

Database corrupted or accidentally deleted:

1. Restore from latest backup
2. Minimal data loss (only changes since backup)

### 4. Testing/Development

Create a copy of production data for testing:

1. Export from production
2. Import into development database
3. Test new features safely

### 5. Sharing Collections

Share your quotes with someone else:

1. Export your collection
2. Send JSON file
3. They import it into their instance

## Technical Details

### Backend Endpoints

**Export**: `GET /api/export/json`

- Returns complete database as JSON
- Includes all relationships
- Preserves all metadata

**Import**: `POST /api/import/json`

- Accepts JSON backup structure
- Validates data before import
- Uses database transactions (atomic)

### Duplicate Detection

**Authors & Sources**: Matched by `name` (case-sensitive)

**Quotes**: Matched by `quote text` + `author_id`

### Import Modes

**Replace Existing** (default):

```sql
INSERT ... ON CONFLICT DO UPDATE
```

- Creates new entries
- Updates existing entries
- Never skips anything

**Skip Duplicates**:

```sql
SELECT ... IF NOT EXISTS INSERT
```

- Creates new entries only
- Skips existing entries
- No updates

### Data Integrity

**Foreign Key Handling:**

1. Import authors first
2. Import sources second
3. Import quotes last (links to authors/sources by name)

**Error Handling:**

- Individual item errors don't stop entire import
- Errors are collected and reported
- Transaction rollback on critical failures

## Best Practices

### Backup Strategy

**Regular Schedule:**

- Daily: Before major editing sessions
- Weekly: Automated backups
- Monthly: Archive backups

**Storage:**

- 📁 Local: External hard drive
- ☁️ Cloud: Google Drive, Dropbox, iCloud
- 🔒 Encrypted: For sensitive quotes

**Retention:**

- Keep last 7 daily backups
- Keep last 4 weekly backups
- Keep last 12 monthly backups

### Before Importing

✅ **Check file validity:**

```bash
cat backup.json | jq .
```

✅ **Verify counts match expectations**

✅ **Backup current data first** (before overwriting)

✅ **Test on development instance** (if possible)

### Import Tips

**Large Imports:**

- May take 30-60 seconds for 1000+ quotes
- Don't close browser tab during import
- Watch progress indicator

**Handling Errors:**

- Check error messages in import result
- Common issues: Invalid characters, missing fields
- Edit JSON file to fix, then re-import

## Comparison: JSON vs PDF

| Feature         | JSON Backup         | PDF Export            |
| --------------- | ------------------- | --------------------- |
| **Purpose**     | Data backup/restore | Human reading         |
| **Contains**    | All database data   | Formatted quotes only |
| **Images**      | Full base64         | Embedded              |
| **Editable**    | Yes (text editor)   | No                    |
| **Import back** | ✅ Yes              | ❌ No                 |
| **Size**        | Large (images)      | Large (images)        |
| **Use for**     | Backup, migration   | Printing, sharing     |

## File Size

Approximate backup sizes:

| Quotes | With Images | Without Images |
| ------ | ----------- | -------------- |
| 100    | ~5 MB       | ~50 KB         |
| 500    | ~25 MB      | ~250 KB        |
| 1000   | ~50 MB      | ~500 KB        |

**Tip:** If images make file too large, you can:

1. Export without images (manually edit JSON)
2. Store images separately
3. Compress JSON file (gzip)

## Troubleshooting

### Import Fails

**Error**: "Invalid backup file format"

- **Solution**: Check JSON is valid, has correct structure

**Error**: "Transaction rollback"

- **Solution**: Check server logs, database constraints

### Slow Import

**Cause**: Large file, many images

- **Solution**: Be patient, it's processing base64 images

### Partial Import

**Cause**: Some quotes reference missing authors/sources

- **Solution**: Check error messages, ensure complete backup

### Database Full

**Cause**: Not enough storage

- **Solution**: Upgrade hosting plan, clean old data

## Security Considerations

**Sensitive Data:**

- Backup files contain ALL quotes (including private notes)
- Store securely, don't share publicly
- Encrypt if needed

**File Validation:**

- Only import files from trusted sources
- Check JSON structure before importing
- Review import preview before confirming

## Automation (Advanced)

### Automated Backups

**Cron Job** (on server):

```bash
# Daily backup at 2 AM
0 2 * * * curl http://localhost:4000/api/export/json > /backups/quotes_$(date +\%Y\%m\%d).json
```

**GitHub Actions**:

```yaml
- name: Backup Database
  run: |
    curl ${{ secrets.APP_URL }}/api/export/json > backup.json
    git add backup.json
    git commit -m "Auto backup $(date)"
    git push
```

## Recovery Procedure

**Disaster Recovery:**

1. **Setup new instance**

   ```bash
   npm install
   npm run migrate
   ```

2. **Restore data**
   - Open app
   - Click "Restore Data"
   - Select latest backup
   - Confirm import

3. **Verify**
   - Check quote counts
   - Test search/filters
   - Verify images display

4. **Resume operations**

## Future Enhancements

Potential improvements:

- 📅 Scheduled automatic backups
- 📧 Email backup files
- ☁️ Direct cloud storage integration (S3, Drive)
- 🔄 Incremental backups (only changes)
- 🗜️ Automatic compression
- 🔐 Encryption support
- 📊 Backup comparison tool
- ⏮️ Rollback to previous backup

## Recommended Workflow

**Daily:**

```
1. Make edits
2. Click "Backup Data" before closing
3. Save to dated folder
```

**Weekly:**

```
1. Review backup files
2. Upload to cloud storage
3. Delete old local backups (keep last 7)
```

**Monthly:**

```
1. Archive monthly backup
2. Test restore on development instance
3. Verify all features work
```

**Before Major Changes:**

```
1. Create backup
2. Make changes
3. Test thoroughly
4. If issues: Restore backup
```

This system ensures you **never lose your quote collection**! 🛡️
