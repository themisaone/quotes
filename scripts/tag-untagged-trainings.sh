#!/bin/bash

# Script to tag all untagged training notes with a specific tag
# Usage: ./scripts/tag-untagged-trainings.sh <tag-name>
# Example: ./scripts/tag-untagged-trainings.sh 2013

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load database config from .env
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-quotes_db}
DB_USER=${DB_USER:-lewel_admin}
DB_PASSWORD=${DB_PASSWORD:-lewel_admin_dev}

# Check if tag name is provided
if [ -z "$1" ]; then
  echo -e "${RED}❌ Error: Tag name is required${NC}"
  echo ""
  echo "Usage: $0 <tag-name>"
  echo "Example: $0 2013"
  exit 1
fi

TAG_NAME="$1"

echo -e "${BLUE}🔍 Checking for untagged training notes...${NC}"
echo ""

# Count untagged training notes
UNTAGGED_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM notes n
WHERE n.note_type = 'training'
  AND NOT EXISTS (
    SELECT 1 FROM note_tags nt
    WHERE nt.note_id = n.id
  );
" | xargs)

if [ "$UNTAGGED_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No untagged training notes found!${NC}"
  echo ""
  echo "All training notes already have tags."
  exit 0
fi

# Show sample of notes that will be tagged
echo -e "${YELLOW}📊 Found ${UNTAGGED_COUNT} untagged training notes${NC}"
echo ""
echo -e "${BLUE}Sample of notes that will be tagged:${NC}"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
SELECT 
  note_date,
  LEFT(comment, 60) as comment
FROM notes n
WHERE n.note_type = 'training'
  AND NOT EXISTS (
    SELECT 1 FROM note_tags nt
    WHERE nt.note_id = n.id
  )
ORDER BY note_date
LIMIT 5;
"

echo ""
echo -e "${GREEN}These ${UNTAGGED_COUNT} notes will be tagged with: \"${TAG_NAME}\"${NC}"
echo ""
read -p "Do you want to continue? (Y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}❌ Cancelled by user${NC}"
  exit 0
fi

echo ""
echo -e "${BLUE}🏷️  Tagging notes...${NC}"

# Execute the tagging
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME << EOF
-- Create the tag if it doesn't exist
INSERT INTO tags (name, type)
VALUES ('$TAG_NAME', 'training')
ON CONFLICT (name, type) DO NOTHING;

-- Tag all untagged training notes
INSERT INTO note_tags (note_id, tag_id)
SELECT n.id, t.id
FROM notes n
CROSS JOIN tags t
WHERE n.note_type = 'training'
  AND t.name = '$TAG_NAME'
  AND t.type = 'training'
  AND NOT EXISTS (
    SELECT 1 FROM note_tags nt
    WHERE nt.note_id = n.id
  )
ON CONFLICT DO NOTHING;
EOF

# Verify the result
NEW_UNTAGGED_COUNT=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM notes n
WHERE n.note_type = 'training'
  AND NOT EXISTS (
    SELECT 1 FROM note_tags nt
    WHERE nt.note_id = n.id
  );
" | xargs)

TAGGED_COUNT=$((UNTAGGED_COUNT - NEW_UNTAGGED_COUNT))

echo ""
echo -e "${GREEN}✅ Successfully tagged ${TAGGED_COUNT} training notes with \"${TAG_NAME}\"${NC}"
echo ""

if [ "$NEW_UNTAGGED_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}ℹ️  ${NEW_UNTAGGED_COUNT} untagged training notes remaining${NC}"
else
  echo -e "${GREEN}🎉 All training notes are now tagged!${NC}"
fi

echo ""
echo -e "${BLUE}💡 Don't forget to refresh your browser (F5) to see the changes!${NC}"
