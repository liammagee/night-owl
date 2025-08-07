# Electron App Customization Guide

## Changing App Name and Icon

### 1. App Name Configuration

The app name is configured in multiple places:

#### A. Package.json
```json
{
  "name": "your-app-name",
  "productName": "Your App Display Name",
  "build": {
    "appId": "com.yourcompany.yourapp",
    "productName": "Your App Display Name"
  }
}
```

#### B. Window Titles (main.js)
- Main window title
- Dialog titles 
- About dialog

#### C. HTML Title (index.html)
- Page title in `<title>` tag
- Custom title bar text

### 2. App Icon Setup

You need icons in multiple formats:

#### Required Icon Sizes:
- **macOS**: 
  - `icon.icns` (512x512, 256x256, 128x128, 64x64, 32x32, 16x16)
  - Place in `build/` folder
  
- **Windows**: 
  - `icon.ico` (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)
  - Place in `build/` folder
  
- **Linux**: 
  - `icon.png` (512x512)
  - Place in `build/` folder

#### Icon Configuration in package.json:
```json
{
  "build": {
    "mac": {
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

### 3. Steps to Change Your App

1. **Create your icon**:
   - Start with a high-resolution PNG (1024x1024)
   - Use online tools like https://iconverticons.com/ to generate all formats

2. **Update package.json**:
   - Change `name` field
   - Update `productName` in build config
   - Add icon paths

3. **Update code references**:
   - Window titles in main.js
   - HTML title and branding
   - Dialog messages

4. **Add icon files**:
   - Place generated icons in `build/` folder
   - Ensure correct naming (icon.icns, icon.ico, icon.png)

5. **Build and test**:
   - Run `npm run build` to create distributables
   - Test on target platforms

### 4. Advanced Customization

- **App ID**: Change `appId` in package.json for unique identification
- **File associations**: Configure file extensions your app should handle
- **Menu customization**: Update application menus in main.js
- **Auto-updater**: Configure update server and signing certificates

### 5. Build Commands

- `npm run electron-dev` - Development mode
- `npm run build` - Build distributables
- `npm run dist` - Build without publishing

### 6. Troubleshooting

- **Icon not showing**: Ensure correct file paths and formats
- **Name not updating**: Clear electron cache, rebuild completely  
- **Build failing**: Check electron-builder logs for missing dependencies
- **macOS notarization**: Need Apple Developer account for distribution

## Quick Setup Checklist

- [ ] Update package.json name and productName
- [ ] Create/add icon files (icns, ico, png)
- [ ] Update window titles in main.js
- [ ] Update HTML title and branding
- [ ] Configure icon paths in build section
- [ ] Test with npm run electron-dev
- [ ] Build distributables with npm run build