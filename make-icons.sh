#!/usr/bin/env bash
set -euo pipefail

# Requires: macOS (has `sips` and `iconutil`), and ImageMagick for ICO/PNG (brew install imagemagick)

mkdir -p build/icon.iconset

# Make a 1024 PNG from SVG (use inkscape or rsvg-convert if you prefer)
if command -v inkscape >/dev/null 2>&1; then
  inkscape build/icon.svg -w 1024 -h 1024 -o build/icon-1024.png
elif command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 1024 -h 1024 build/icon.svg -o build/icon-1024.png
else
  echo "Need inkscape or rsvg-convert to rasterize SVG. Install inkscape: brew install inkscape"
  exit 1
fi

# Fill the .iconset with all sizes (sips preserves alpha)
for s in 16 32 128 256 512; do
  sips -z $s $s build/icon-1024.png --out build/icon.iconset/icon_${s}x${s}.png >/dev/null
  s2=$((s*2))
  sips -z $s2 $s2 build/icon-1024.png --out build/icon.iconset/icon_${s}x${s}@2x.png >/dev/null
done

# Create .icns
iconutil -c icns build/icon.iconset -o build/icon.icns

# Linux PNG
magick convert build/icon-1024.png -resize 512 build/icon.png

# Windows ICO (multi-size)
magick convert build/icon-1024.png \
  \( -resize 16 \) \( -resize 24 \) \( -resize 32 \) \
  \( -resize 48 \) \( -resize 64 \) \( -resize 128 \) \
  \( -resize 256 \) build/icon.ico

echo "Done:"
echo "  build/icon.icns (macOS)"
echo "  build/icon.png   (Linux 512x512)"
echo "  build/icon.ico   (Windows multi-size)"
