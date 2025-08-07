# App Branding & Icon Configuration Guide

## Overview
This guide explains how the Hegel Pedagogy AI app branding and icons are configured across different platforms.

## Current Configuration

### App Name
- **Display Name**: "Hegel Pedagogy AI"
- **Package Name**: `hegel-pedagogy-ai`
- **App ID**: `com.hegel.pedagogy.electron`

### Icon Files Location
All icon files are stored in the `/build/` directory:
```
build/
├── icon.png      # 512x512 PNG for general use
├── icon.ico      # Windows ICO format
├── icon.icns     # macOS ICNS format
├── icon.svg      # Scalable SVG format
└── icon-1024.png # High-resolution PNG
```

## Platform-Specific Settings

### macOS
- **Dock Icon**: Automatically set via `app.dock.setIcon()`
- **App Bundle**: Uses `icon.icns` when building
- **Window Icon**: Uses `icon.png`
- **Category**: Education (`public.app-category.education`)

### Windows
- **Window Icon**: Uses `icon.ico`
- **Installer**: NSIS format with `icon.ico`

### Linux
- **Window Icon**: Uses `icon.png`
- **Package**: AppImage format with `icon.png`

## Implementation Details

### Main Process (`main.js`)
```javascript
// Set app name early in the process
app.setName('Hegel Pedagogy AI');

// Set window icon
icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')

// Set dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.setIcon(path.join(__dirname, 'build', 'icon.png'));
}
```

### HTML Document
```html
<title>Hegel Pedagogy AI - Advanced Editor & Presentations</title>
<link rel="icon" type="image/png" href="build/icon.png">
<link rel="icon" type="image/svg+xml" href="build/icon.svg">
```

### Package Configuration (`package.json`)
```json
{
  "name": "hegel-pedagogy-ai",
  "productName": "Hegel Pedagogy AI",
  "build": {
    "appId": "com.hegel.pedagogy.electron",
    "productName": "Hegel Pedagogy AI",
    "mac": {
      "category": "public.app-category.education",
      "icon": "build/icon.icns"
    },
    "win": {
      "icon": "build/icon.ico"
    },
    "linux": {
      "icon": "build/icon.png"
    }
  }
}
```

## Icon Generation

### Automatic Generation
Use the provided script to generate all required icon formats:
```bash
./scripts/generate-icons.sh
```

This script will:
1. Take a source PNG image (preferably 1024x1024)
2. Generate all required platform-specific formats
3. Place them in the `build/` directory

### Manual Icon Requirements
- **Source Image**: 1024x1024 PNG with transparent background
- **Design**: Simple, recognizable icon that works at small sizes
- **Colors**: Should work on both light and dark backgrounds

## Testing Icon Changes

### Development Mode
```bash
npm run electron-dev
```
- Window icon appears immediately
- Dock icon (macOS) updates automatically
- Console shows "Dock icon set successfully"

### Production Build
```bash
npm run build
```
- Creates platform-specific installers with proper icons
- Icons are embedded in the application bundle

## Troubleshooting

### Icon Not Updating in Development
1. **Clear Cache**: Restart the Electron app completely
2. **Check Paths**: Ensure icon files exist in `build/` directory
3. **Platform Issues**: Different platforms cache icons differently

### Icon Not Showing in Built App
1. **Build Files**: Ensure `build/` directory is included in electron-builder files
2. **File Formats**: Use correct format for each platform
3. **Permissions**: Check that icon files are readable

### Common Issues
- **Wrong Path**: Icon paths are relative to `main.js` location
- **File Format**: Windows needs `.ico`, macOS prefers `.icns` for builds
- **Size Requirements**: Too small icons may not display properly
- **Cache**: OS may cache old icons, try logging out/in

## Future Enhancements
- **Adaptive Icons**: Support for dynamic icons based on system theme
- **Status Icons**: Different icons for different app states
- **Tray Icons**: System tray/menu bar icons
- **Document Icons**: Custom file type icons for .md files

## Notes
- Icons are set both programmatically and through build configuration
- Development and production may show icons differently
- macOS dock icons update immediately, Windows may require restart
- SVG icons provide the best scalability across different display densities