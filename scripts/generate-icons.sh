#!/bin/bash

# Icon generation script for NightOwl
# Requires: librsvg (brew install librsvg) and ImageMagick (brew install imagemagick)

echo "Generating app icons..."

# Create build directory if it doesn't exist
mkdir -p build
cd build

# Check for rsvg-convert (better SVG rendering)
if command -v rsvg-convert &> /dev/null; then
    echo "Using rsvg-convert for SVG rendering..."
    rsvg-convert -w 1024 -h 1024 icon.svg -o icon-1024.png
elif command -v magick &> /dev/null; then
    echo "Using ImageMagick for SVG rendering..."
    magick icon.svg -background none -resize 1024x1024 icon-1024.png
elif command -v convert &> /dev/null; then
    echo "Using ImageMagick convert for SVG rendering..."
    convert icon.svg -background none -resize 1024x1024 icon-1024.png
else
    echo "Error: Neither rsvg-convert nor ImageMagick found."
    echo "Install with: brew install librsvg imagemagick"
    exit 1
fi

# Check if ImageMagick is installed
if command -v magick &> /dev/null; then
    MAGICK="magick"
elif command -v convert &> /dev/null; then
    MAGICK="convert"
else
    echo "ImageMagick is required for resizing."
    echo "Install it with: brew install imagemagick"
    exit 1
fi

# Generate PNG for Linux
echo "Generating Linux icon..."
$MAGICK icon-1024.png -resize 512x512 icon.png

# Generate ICO for Windows (requires multiple sizes)
echo "Generating Windows icon..."
$MAGICK icon-1024.png \
    \( -clone 0 -resize 256x256 \) \
    \( -clone 0 -resize 128x128 \) \
    \( -clone 0 -resize 64x64 \) \
    \( -clone 0 -resize 48x48 \) \
    \( -clone 0 -resize 32x32 \) \
    \( -clone 0 -resize 16x16 \) \
    -delete 0 icon.ico

# Generate ICNS for macOS (requires iconutil on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Generating macOS icon..."

    # Create iconset directory
    mkdir -p icon.iconset

    # Generate all required sizes for macOS
    $MAGICK icon-1024.png -resize 16x16 icon.iconset/icon_16x16.png
    $MAGICK icon-1024.png -resize 32x32 icon.iconset/icon_16x16@2x.png
    $MAGICK icon-1024.png -resize 32x32 icon.iconset/icon_32x32.png
    $MAGICK icon-1024.png -resize 64x64 icon.iconset/icon_32x32@2x.png
    $MAGICK icon-1024.png -resize 128x128 icon.iconset/icon_128x128.png
    $MAGICK icon-1024.png -resize 256x256 icon.iconset/icon_128x128@2x.png
    $MAGICK icon-1024.png -resize 256x256 icon.iconset/icon_256x256.png
    $MAGICK icon-1024.png -resize 512x512 icon.iconset/icon_256x256@2x.png
    $MAGICK icon-1024.png -resize 512x512 icon.iconset/icon_512x512.png
    $MAGICK icon-1024.png -resize 1024x1024 icon.iconset/icon_512x512@2x.png

    # Convert iconset to icns
    iconutil -c icns icon.iconset -o icon.icns

    # Clean up iconset directory
    rm -rf icon.iconset

    echo "macOS icon generated: build/icon.icns"
else
    echo "Skipping macOS icon generation (not on macOS)"
fi

echo ""
echo "Icon generation complete!"
echo "Generated files:"
echo "  - build/icon.png (Linux)"
echo "  - build/icon.ico (Windows)"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  - build/icon.icns (macOS)"
fi
