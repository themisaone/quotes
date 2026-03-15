#!/bin/bash

# 🗄️ Database Clone Script
# Usage: ./scripts/clone-database.sh <SOURCE_DB_URL> <LOCAL_DB_URL_FOR_CREDS> <NEW_DB_NAME>
#
# Example:
#   ./scripts/clone-database.sh \
#     "postgresql://postgres:pass@remote-host:5432/prod_db" \
#     "postgresql://lewel_admin:lewel_admin_dev@localhost:5432/lewel_dev" \
#     "prod_clone"
#
# This script will:
# 1. Parse connection details from provided URLs
# 2. Drop existing database with NEW_DB_NAME (if exists)
# 3. Create fresh database
# 4. Clone ALL schema + data from SOURCE to NEW database
# 5. Uses Docker with PostgreSQL 17 to handle version mismatches

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -ne 3 ]; then
    echo -e "${RED}❌ Error: Wrong number of arguments${NC}"
    echo ""
    echo "Usage: $0 <SOURCE_DB_URL> <LOCAL_DB_URL_FOR_CREDS> <NEW_DB_NAME>"
    echo ""
    echo "Example:"
    echo "  $0 \\"
    echo "    'postgresql://postgres:pass@remote:5432/prod' \\"
    echo "    'postgresql://lewel_admin:dev_pass@localhost:5432/lewel_dev' \\"
    echo "    'prod_clone'"
    exit 1
fi

SOURCE_URL="$1"
LOCAL_URL="$2"
NEW_DB_NAME="$3"

echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}   🗄️  PostgreSQL Database Clone Tool${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

# Extract credentials from LOCAL_URL
echo -e "${YELLOW}📝 Parsing connection details...${NC}"
LOCAL_USER=$(echo "$LOCAL_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
LOCAL_PASS=$(echo "$LOCAL_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
LOCAL_HOST=$(echo "$LOCAL_URL" | sed -E 's|.*@([^:]+):.*|\1|')
LOCAL_PORT=$(echo "$LOCAL_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')

echo -e "   Source DB: ${GREEN}${SOURCE_URL}${NC}"
echo -e "   Target: ${GREEN}${LOCAL_USER}@${LOCAL_HOST}:${LOCAL_PORT}/${NEW_DB_NAME}${NC}"
echo ""

# Build target connection URL
TARGET_BASE_URL="postgresql://${LOCAL_USER}:${LOCAL_PASS}@${LOCAL_HOST}:${LOCAL_PORT}/postgres"
TARGET_NEW_URL="postgresql://${LOCAL_USER}:${LOCAL_PASS}@${LOCAL_HOST}:${LOCAL_PORT}/${NEW_DB_NAME}"

# Step 1: Drop and create database
echo -e "${YELLOW}🗑️  Dropping existing '${NEW_DB_NAME}' database (if exists)...${NC}"
psql "$TARGET_BASE_URL" -c "DROP DATABASE IF EXISTS ${NEW_DB_NAME};" 2>&1 | grep -E "(DROP|does not exist)" || true

echo -e "${YELLOW}📦 Creating new database '${NEW_DB_NAME}'...${NC}"
psql "$TARGET_BASE_URL" -c "CREATE DATABASE ${NEW_DB_NAME} OWNER ${LOCAL_USER};"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to create database${NC}"
    exit 1
fi
echo -e "${GREEN}   ✅ Database created${NC}"
echo ""

# Step 2: Clone database using Docker (handles version mismatches)
echo -e "${YELLOW}🔄 Cloning database (schema + data)...${NC}"
echo -e "   This may take a few minutes depending on database size..."
echo ""

# Use Docker with PostgreSQL 17 to avoid version mismatch issues
docker run --rm --network host postgres:17 pg_dump "$SOURCE_URL" 2>&1 | \
    psql "$TARGET_NEW_URL" 2>&1 | \
    tail -20

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Clone failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Clone completed!${NC}"
echo ""

# Step 3: Verify
echo -e "${YELLOW}🔍 Verifying clone...${NC}"
TABLE_COUNT=$(psql "$TARGET_NEW_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>&1 | tr -d ' ')

if [ -z "$TABLE_COUNT" ] || [ "$TABLE_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ Verification failed - no tables found!${NC}"
    exit 1
fi

echo -e "${GREEN}   ✅ Found ${TABLE_COUNT} tables${NC}"
echo ""

# Show some statistics
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}   📊 Clone Statistics${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"

# Get row counts for key tables
psql "$TARGET_NEW_URL" -c "
SELECT 
    schemaname as schema,
    relname as table_name,
    n_live_tup as rows
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC
LIMIT 10;
" 2>&1 | head -20

echo ""
echo -e "${GREEN}🎉 Database cloned successfully!${NC}"
echo ""
echo -e "New database URL:"
echo -e "${BLUE}${TARGET_NEW_URL}${NC}"
echo ""
echo -e "${YELLOW}💡 To use in your .env:${NC}"
echo -e "DATABASE_URL=\"${TARGET_NEW_URL}\""
echo ""
