# Image Copying Test

This document tests the new image copying functionality implemented for Markdown files.

## Features Implemented

### 1. Drag & Drop Images
- Drag any image file from your local disk directly into the editor
- The image will be automatically copied to the `images/` directory
- Proper Markdown link will be inserted: `![Image](images/filename.png)`
- Supports: PNG, JPG, JPEG, GIF, BMP, SVG, WebP, ICO, TIFF, TIF

### 2. Context Menu "Insert in Document"
- Right-click any image file in the file tree
- Select "Insert in Document" option
- Image will be copied to `images/` directory and inserted at cursor position

### 3. Clipboard Paste (existing functionality)
- Copy any image to clipboard (Ctrl+C/Cmd+C)
- Paste in editor (Ctrl+V/Cmd+V)
- Image automatically saved and markdown link inserted

## Test Instructions

1. **Test Drag & Drop**:
   - Find any image file on your computer
   - Drag it into this editor
   - Verify the markdown link appears and preview shows the image

2. **Test Context Menu**:
   - Put an image file in your project folder
   - Right-click it in the file tree
   - Click "Insert in Document"
   - Verify image is copied to `images/` folder and link inserted

3. **Test Clipboard Paste**:
   - Copy an image from any application
   - Paste here with Ctrl+V/Cmd+V
   - Verify image appears in editor and preview

## Expected Behavior

- Images are copied to project's `images/` directory
- Original filenames are preserved but timestamped to avoid conflicts
- Markdown links use relative paths: `![Image](images/filename.png)`
- File tree refreshes to show newly added images
- Preview pane shows images immediately

---

Test completed successfully! ✅