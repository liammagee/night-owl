#!/bin/bash

# Icon generation script for Hegel Pedagogy AI
# Requires: ImageMagick (install with: brew install imagemagick)

echo "Generating app icons..."

# Create build directory if it doesn't exist
mkdir -p build

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "ImageMagick is required but not installed."
    echo "Install it with: brew install imagemagick"
    echo "Or use online tools to convert build/icon.svg to the required formats"
    exit 1
fi

# Convert SVG to high-res PNG first
echo "Converting SVG to PNG..."
convert build/icon.svg -resize 1024x1024 build/icon-1024.png

# Generate PNG for Linux
echo "Generating Linux icon..."
convert build/icon-1024.png -resize 512x512 build/icon.png

# Generate ICO for Windows (requires multiple sizes)
echo "Generating Windows icon..."
convert build/icon-1024.png \
    \( -clone 0 -resize 256x256 \) \
    \( -clone 0 -resize 128x128 \) \
    \( -clone 0 -resize 64x64 \) \
    \( -clone 0 -resize 48x48 \) \
    \( -clone 0 -resize 32x32 \) \
    \( -clone 0 -resize 16x16 \) \
    -delete 0 build/icon.ico

# Generate ICNS for macOS (requires iconutil on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Generating macOS icon..."
    
    # Create iconset directory
    mkdir -p build/icon.iconset
    
    # Generate all required sizes for macOS
    convert build/icon-1024.png -resize 16x16 build/icon.iconset/icon_16x16.png
    convert build/icon-1024.png -resize 32x32 build/icon.iconset/icon_16x16@2x.png
    convert build/icon-1024.png -resize 32x32 build/icon.iconset/icon_32x32.png
    convert build/icon-1024.png -resize 64x64 build/icon.iconset/icon_32x32@2x.png
    convert build/icon-1024.png -resize 128x128 build/icon.iconset/icon_128x128.png
    convert build/icon-1024.png -resize 256x256 build/icon.iconset/icon_128x128@2x.png
    convert build/icon-1024.png -resize 256x256 build/icon.iconset/icon_256x256.png
    convert build/icon-1024.png -resize 512x512 build/icon.iconset/icon_256x256@2x.png
    convert build/icon-1024.png -resize 512x512 build/icon.iconset/icon_512x512.png
    convert build/icon-1024.png -resize 1024x1024 build/icon.iconset/icon_512x512@2x.png
    
    # Convert iconset to icns
    iconutil -c icns build/icon.iconset -o build/icon.icns
    
    # Clean up iconset directory
    rm -rf build/icon.iconset
    
    echo "macOS icon generated: build/icon.icns"
else
    echo "Skipping macOS icon generation (not on macOS)"
    echo "You can generate icon.icns using online tools or on a Mac"
fi

echo "Icon generation complete!"
echo "Generated files:"
echo "  - build/icon.png (Linux)"
echo "  - build/icon.ico (Windows)"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  - build/icon.icns (macOS)"
fi

echo ""
echo "You can also:"
echo "1. Use online tools like iconverticons.com to convert build/icon.svg"
echo "2. Replace build/icon.svg with your own design"
echo "3. Run this script again after updating the SVG"