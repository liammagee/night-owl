# Icon Setup Instructions

## Quick Setup (Recommended)

### Option 1: Use Online Tools
1. Go to https://iconverticons.com/ or https://www.img2icns.com/
2. Upload the `build/icon.svg` file
3. Download the generated icons:
   - `icon.icns` for macOS → place in `build/`
   - `icon.ico` for Windows → place in `build/`
   - `icon.png` (512x512) for Linux → place in `build/`

### Option 2: Use ImageMagick (if installed)
```bash
# Install ImageMagick first
brew install imagemagick

# Run the generation script
./scripts/generate-icons.sh
```

### Option 3: Manual Creation
Create these files in the `build/` folder:
- `icon.icns` - macOS icon file
- `icon.ico` - Windows icon file  
- `icon.png` - Linux icon file (512x512px)

## Current Status

✅ Package.json configured with icon paths
✅ SVG template created (`build/icon.svg`)
✅ Icon generation script ready
⏳ Icons need to be generated (use options above)

## Testing Your Icons

After adding icon files:

1. **Development testing**:
   ```bash
   npm run electron-dev
   ```

2. **Build testing**:
   ```bash
   npm run build
   ```

3. **Check generated app**:
   - macOS: Look in `dist/mac/`
   - Windows: Look in `dist/win/`
   - Linux: Look in `dist/linux/`

## Customizing Your Icon

1. Edit `build/icon.svg` or replace it with your own design
2. Ensure the design works at small sizes (16x16px)
3. Use simple, bold shapes and limited colors
4. Re-generate icons after making changes

## Troubleshooting

- **Icon not showing in development**: Normal - dev mode uses default Electron icon
- **Icon not showing in built app**: Check file paths and names are correct
- **Build failing**: Ensure icon files exist and are in correct formats
- **Wrong icon in dock/taskbar**: May need to restart system or clear cache