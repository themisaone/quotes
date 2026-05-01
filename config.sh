#!/usr/bin/env bash
# =============================================================================
# config.sh — one-time setup before first launch
# Run this after completing steps 0-5 in INSTALL.txt.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "============================================"
echo "  Notes Archive — Configuration Setup"
echo "============================================"
echo ""

# ── Guard: .env must exist ────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "ERROR: .env file not found."
  echo "       Please complete step 5 of INSTALL.txt first:"
  echo "         cp .env.example .env"
  echo "         (then edit .env with your DB credentials)"
  echo ""
  exit 1
fi

# ── Ask for vault path ────────────────────────────────────────────────────────
echo "Where should your Vault be stored?"
echo "This is the directory that will hold your attachments, palettes and settings."
echo "(Example: /home/yourname/MyNotesVault  or  ~/Documents/NoteArchive)"
echo ""
read -rp "Path to Vault: " VAULT_PATH

# Expand a leading ~ to the real home directory
VAULT_PATH="${VAULT_PATH/#\~/$HOME}"

# Strip trailing slash for consistency
VAULT_PATH="${VAULT_PATH%/}"

if [ -z "$VAULT_PATH" ]; then
  echo ""
  echo "ERROR: No path entered. Aborting."
  exit 1
fi

echo ""

# ── Create vault directory structure ─────────────────────────────────────────
echo "Creating vault directories..."
mkdir -p "$VAULT_PATH/attachments"
mkdir -p "$VAULT_PATH/palettes"
mkdir -p "$VAULT_PATH/config/palettes"

# ── Copy default palettes → vault ─────────────────────────────────────────────
echo "Copying default palettes..."
cp -r "$SCRIPT_DIR/inst/default.palettes/." "$VAULT_PATH/config/palettes/"

# ── Copy default settings.json → vault ───────────────────────────────────────
echo "Copying default settings..."
cp "$SCRIPT_DIR/inst/default.settings.json" "$VAULT_PATH/config/settings.json"

# ── Copy default modes.json → ./config/ ──────────────────────────────────────
echo "Copying default modes..."
cp "$SCRIPT_DIR/inst/default.modes.json" "$SCRIPT_DIR/config/modes.json"

# ── Patch and copy local.json → ./config/  ($VAULT_PATH$ → actual path) ──────
echo "Configuring local.json..."
sed "s|\$VAULT_PATH\$|$VAULT_PATH|g" \
    "$SCRIPT_DIR/inst/default.local.json" > "$SCRIPT_DIR/config/local.json"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Setup complete!"
echo ""
echo "  Vault location : $VAULT_PATH"
echo "  Attachments    : $VAULT_PATH/attachments"
echo "  Palettes       : $VAULT_PATH/config/palettes"
echo "  Settings       : $VAULT_PATH/config/settings.json"
echo ""
echo "  All good now — start your note app with:"
echo ""
echo "    npm run all"
echo ""
echo "  Then open: http://localhost:4000"
echo "============================================"
echo ""
