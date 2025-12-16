#!/bin/bash

# Sync plugins and themes from the techne-plugins repository to NightOwl
# Usage: ./scripts/sync-plugins-from-techne.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TECHNE_PLUGINS_DIR="/Users/lmagee/Dev/techne-plugins"

echo "Syncing plugins and themes from techne-plugins to NightOwl..."
echo "Source: $TECHNE_PLUGINS_DIR"
echo "Destination: $PROJECT_ROOT"
echo ""

# Check if source exists
if [ ! -d "$TECHNE_PLUGINS_DIR" ]; then
    echo "Error: techne-plugins directory not found at $TECHNE_PLUGINS_DIR"
    exit 1
fi

# Sync the plugin system core
echo "Syncing core/techne-plugin-system.js..."
cp "$TECHNE_PLUGINS_DIR/core/techne-plugin-system.js" "$PROJECT_ROOT/plugins/"

# Sync each plugin directory
for plugin_dir in "$TECHNE_PLUGINS_DIR/plugins/techne-"*; do
    plugin_name=$(basename "$plugin_dir")
    echo "Syncing $plugin_name..."
    rsync -av --delete "$plugin_dir/" "$PROJECT_ROOT/plugins/$plugin_name/"
done

# Sync presentation themes
echo ""
echo "Syncing presentation themes..."
mkdir -p "$PROJECT_ROOT/styles/templates/presentations"
rsync -av --delete "$TECHNE_PLUGINS_DIR/themes/presentations/" "$PROJECT_ROOT/styles/templates/presentations/"

echo ""
echo "Sync complete!"
echo ""
echo "Note: manifest.js is NOT synced - each app maintains its own manifest"
echo "with app-specific enabledByDefault settings."
