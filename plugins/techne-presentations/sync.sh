#!/bin/bash

# Sync techne-presentations plugin to other repositories
#
# Source of truth: techne-plugins/plugins/techne-presentations/
# - JSX source in src/
# - Build outputs transpiled JS to this directory
# - CSS and other JS files edited directly here
#
# Targets:
# - machinespirits-website/plugins/techne-presentations/
# - hegel-pedagogy-ai/plugins/techne-presentations/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

# Target directories
MY_WEBSITE="$DEV_DIR/machinespirits-website/plugins/techne-presentations"
HEGEL_PLUGINS="$DEV_DIR/hegel-pedagogy-ai/plugins/techne-presentations"

echo "=== Techne Presentations Plugin Sync ==="
echo ""
echo "Source: $SCRIPT_DIR"
echo ""

# Step 1: Build JSX to JS
echo "1. Building JSX..."
cd "$SCRIPT_DIR"
npm run build
echo ""

# Step 2: Sync files to other repos
echo "2. Syncing to other repositories..."

FILES_TO_SYNC=(
    "MarkdownPreziApp.js"
    "preview-presentation.css"
    "touch-gestures.js"
    "ttsService.js"
    "speaker-notes.js"
    "speaker-notes.css"
    "plugin.js"
    "videoRecordingService.js"
)

for file in "${FILES_TO_SYNC[@]}"; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
        echo "   $file:"

        if [ -d "$MY_WEBSITE" ]; then
            cp "$SCRIPT_DIR/$file" "$MY_WEBSITE/$file"
            echo "      -> machinespirits-website"
        fi

        if [ -d "$HEGEL_PLUGINS" ]; then
            cp "$SCRIPT_DIR/$file" "$HEGEL_PLUGINS/$file"
            echo "      -> hegel-pedagogy-ai"
        fi
    fi
done

echo ""

# Step 3: Verify
echo "3. Verifying..."
ALL_MATCH=true

for file in "${FILES_TO_SYNC[@]}"; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
        HASH_SRC=$(md5 -q "$SCRIPT_DIR/$file")
        HASH_MW=$(md5 -q "$MY_WEBSITE/$file" 2>/dev/null || echo "MISSING")
        HASH_HP=$(md5 -q "$HEGEL_PLUGINS/$file" 2>/dev/null || echo "MISSING")

        if [ "$HASH_SRC" = "$HASH_MW" ] && [ "$HASH_SRC" = "$HASH_HP" ]; then
            echo "   ✓ $file"
        else
            echo "   ✗ $file - MISMATCH"
            ALL_MATCH=false
        fi
    fi
done

echo ""
if $ALL_MATCH; then
    echo "=== Sync complete ==="
else
    echo "=== Sync completed with warnings ==="
    exit 1
fi
