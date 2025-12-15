#!/bin/bash
# Sync Techne plugins from NightOwl to the LMS (my-website)
# Usage: ./scripts/sync-plugins-to-lms.sh

set -e

SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="${HOME}/Dev/my-website"

echo "Syncing plugins from NightOwl to LMS..."
echo "  Source: $SOURCE_DIR/plugins"
echo "  Target: $TARGET_DIR/plugins"

# Sync the core plugin system
echo "  - techne-plugin-system.js"
cp "$SOURCE_DIR/plugins/techne-plugin-system.js" "$TARGET_DIR/plugins/"

# Sync individual plugins (preserving LMS-specific files like lms-host-adapter.js)
for plugin in techne-circle techne-maze techne-markdown-renderer techne-presentations techne-backdrop; do
    if [ -d "$SOURCE_DIR/plugins/$plugin" ]; then
        echo "  - $plugin/"
        rsync -av --delete "$SOURCE_DIR/plugins/$plugin/" "$TARGET_DIR/plugins/$plugin/"
    fi
done

# Note: We don't sync manifest.js or lms-host-adapter.js as those are LMS-specific

echo ""
echo "Done! Remember to:"
echo "  1. Update $TARGET_DIR/plugins/manifest.js if new plugins were added"
echo "  2. Test the plugins in the LMS: cd $TARGET_DIR && npm run dev"
