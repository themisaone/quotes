# ENEX Import Script

This script converts Evernote ENEX export files into a format that can be directly imported into your Notes application using the "Restore Data" feature.

## Usage

```bash
node scripts/parse-enex.js <enex-file> [output-json-file] [training-type]
```

### Parameters

- **enex-file** (required): Path to your Evernote ENEX export file
- **output-json-file** (optional): Output JSON filename. Defaults to `<enex-file>-import.json`
- **training-type** (optional): Training type for all notes. Defaults to `WEIGHTS`

### Training Types

Available training types:
- `WEIGHTS` - Weight/strength training (default)
- `CARDIO` - Cardio exercises
- `FLEXIBILITY` - Stretching/flexibility work
- `SPORTS` - Sports activities

## Examples

### Basic usage (defaults to WEIGHTS)
```bash
node scripts/parse-enex.js 2026.enex
# Creates: 2026-import.json with all notes as WEIGHTS type
```

### Specify output filename
```bash
node scripts/parse-enex.js 2026.enex my-training-2026.json
# Creates: my-training-2026.json
```

### Specify training type
```bash
node scripts/parse-enex.js cardio-workouts.enex cardio-2026.json CARDIO
# Creates: cardio-2026.json with all notes as CARDIO type
```

## Requirements

### Evernote Title Format

The script expects note titles to contain a date in the format:
- `YYYY.MM.DD` (e.g., `2026.01.29`)
- Optionally followed by day name: `YYYY.MM.DD DayName` (e.g., `2026.01.29 Torsdag`)

Examples of valid titles:
- `2026.01.29 Torsdag`
- `2026.02.15`
- `2026.03.01 Søndag`

Notes without a parseable date will be skipped.

## Import Process

After running the script:

1. **Open your Notes app** in the browser
2. **Click "Restore Data" (📥)** in the left menu
3. **Select the generated JSON file**
4. **Click to import**

The import will:
- Create training notes with the correct dates
- Set the training type (WEIGHTS, CARDIO, etc.)
- Preserve the original Evernote title in the "note" field
- Convert ENML (Evernote Markup Language) to HTML

## What Gets Converted

- **Content**: Evernote note content → HTML (in the `quote` field)
- **Date**: Parsed from title → `note_date` field
- **Title**: Original Evernote title → `note` field (appears as comment)
- **Type**: Set to specified training type (default: WEIGHTS)
- **Note Type**: Automatically set to `training`
- **Attachments**: Resources (images, PDFs, Excel files, etc.) → `image` field as base64 data URL

### Attachment Support

The script automatically extracts and includes any attachments (resources) from Evernote notes:
- **Supported formats**: Images (PNG, JPG, GIF), PDFs, Excel files (XLSX, XLS), Word documents (DOCX, DOC), and other file types
- **Storage**: Attachments are converted to base64 data URLs and stored in the `image` field
- **File info**: The original filename and MIME type are preserved
- **Example**: An Excel file `Trying trening.xlsx` will be available for download after import

When you import notes with attachments, they'll appear in the Notes app with a download button to retrieve the original file.

## Output Format

The script generates a JSON file compatible with the "Restore Data" feature:

```json
{
  "data": {
    "quotes": [
      {
        "quote": "<p>Training content here...</p>",
        "note_type": "training",
        "note_date": "2026-01-29",
        "type": "WEIGHTS",
        "note": "2026.01.29 Torsdag",
        "author_name": null,
        "source_name": null,
        "image": "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEsDBBQ...",
        "image_full": "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEsDBBQ...",
        "storage_type": "base64",
        "created_at": "2026-01-29T00:00:00.000Z",
        "updated_at": "2026-03-08T13:45:00.000Z"
      }
    ],
    "authors": [],
    "sources": [],
    "tags": []
  },
  "counts": {
    "quotes": 24,
    "authors": 0,
    "sources": 0,
    "tags": 0
  }
}
```

Notes with attachments will have the `image` and `image_full` fields populated with base64-encoded data URLs.

## Troubleshooting

### "Could not parse date from title"
- Make sure your Evernote note titles contain dates in `YYYY.MM.DD` format
- Notes without valid dates will be skipped

### "Empty content for date"
- The note has a valid date but no content
- Check if the Evernote note actually has content

### Import shows "0 created"
- Make sure you're using the latest version of the script
- Verify the server is running
- Check the browser console for errors

### Notes don't appear in Training view
- Make sure the `type` field is set (should be WEIGHTS by default)
- Check that training type checkboxes are selected in the filter

## Technical Details

- Converts ENML (Evernote Markup Language) to HTML
- Removes Evernote-specific metadata and styling
- Preserves formatting (paragraphs, line breaks)
- Handles HTML entities correctly
- Compatible with the application's import/export system
