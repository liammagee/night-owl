#!/usr/bin/env bash
set -euo pipefail

WEBSITE_DIR="${1:-$HOME/Dev/my-website}"

if [[ ! -d "$WEBSITE_DIR" ]]; then
  echo "Error: website dir not found: $WEBSITE_DIR" >&2
  exit 1
fi

if [[ ! -f "$WEBSITE_DIR/index.html" ]]; then
  echo "Error: missing $WEBSITE_DIR/index.html" >&2
  exit 1
fi

if [[ ! -f "$WEBSITE_DIR/fauna-overlay.js" ]]; then
  echo "Error: missing $WEBSITE_DIR/fauna-overlay.js" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PLUGIN_DIR="$ROOT_DIR/plugins/techne-backdrop"
mkdir -p "$PLUGIN_DIR"

cp -f "$WEBSITE_DIR/fauna-overlay.js" "$PLUGIN_DIR/fauna-overlay.js"

cat > "$PLUGIN_DIR/techne-backdrop-layers.css" <<'EOF'
/* Techne backdrop layers
   - Shapes layer + rotating shapes + fauna overlay
   - Source of truth is ~/Dev/my-website (sync via ./scripts/sync-techne-backdrop-from-website.sh)
*/

EOF

awk 'BEGIN{p=0} /\/\* ========== LAYER 4: GEOMETRIC SHAPES ========== \*\//{p=1} p{print} /\/\* ========== LAYER 5:/{if(p){exit}}' "$WEBSITE_DIR/index.html" >> "$PLUGIN_DIR/techne-backdrop-layers.css"
printf "\n\n" >> "$PLUGIN_DIR/techne-backdrop-layers.css"
awk 'BEGIN{p=0} /\/\* ========== LAYER 7: ROTATING SHAPES ========== \*\//{p=1} p{print} /\/\* ========== LAYER 8: FAUNA OVERLAY ========== \*\//{if(p){exit}}' "$WEBSITE_DIR/index.html" >> "$PLUGIN_DIR/techne-backdrop-layers.css"
printf "\n\n" >> "$PLUGIN_DIR/techne-backdrop-layers.css"
awk 'BEGIN{p=0} /\/\* ========== LAYER 8: FAUNA OVERLAY ========== \*\//{p=1} p{print} /\/\* ========== NAVIGATION ========== \*\//{if(p){exit}}' "$WEBSITE_DIR/index.html" >> "$PLUGIN_DIR/techne-backdrop-layers.css"

cat > "$PLUGIN_DIR/techne-backdrop-markup.js" <<'EOF'
/* Techne backdrop markup (synced from ~/Dev/my-website/index.html)
   Update via: ./scripts/sync-techne-backdrop-from-website.sh
*/

window.TECHNE_BACKDROP_LAYERS_HTML = `
EOF

awk 'BEGIN{p=0} /<!-- LAYER 4: Shapes -->/{p=1} p{if(/<!-- LAYER 5:/){exit} print}' "$WEBSITE_DIR/index.html" >> "$PLUGIN_DIR/techne-backdrop-markup.js"
echo '' >> "$PLUGIN_DIR/techne-backdrop-markup.js"
awk 'BEGIN{p=0} /<!-- LAYER 7: Rotating shapes -->/{p=1} p{if(/<!-- LAYER 8:/){exit} print}' "$WEBSITE_DIR/index.html" >> "$PLUGIN_DIR/techne-backdrop-markup.js"
echo '' >> "$PLUGIN_DIR/techne-backdrop-markup.js"
awk 'BEGIN{p=0} /<!-- LAYER 8: Fauna overlay -->/{p=1} p{if(/<!-- NAVIGATION -->/){exit} print}' "$WEBSITE_DIR/index.html" >> "$PLUGIN_DIR/techne-backdrop-markup.js"

echo '`;' >> "$PLUGIN_DIR/techne-backdrop-markup.js"

echo "Synced Techne backdrop layers from $WEBSITE_DIR"
