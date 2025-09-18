# Citation Insertion Feature Test

This document tests the new right-click citation insertion functionality.

## Feature Overview

The citation insertion feature allows you to:
- **Right-click** in the editor to access "Insert Citation..." option
- **Search and browse** available citations from your BibTeX files
- **Insert citations** with proper markdown formatting: `[@citationkey]`
- Use **keyboard shortcut**: Ctrl/Cmd + Shift + C

## Testing Instructions

### Method 1: Right-Click Context Menu
1. Right-click anywhere in this document
2. Look for "Insert Citation..." option in the context menu
3. Click it to open the citation dialog

### Method 2: Keyboard Shortcut
1. Place cursor where you want to insert a citation
2. Press **Ctrl+Shift+C** (Cmd+Shift+C on Mac)
3. Citation dialog should open

### Method 3: Command Palette
1. Press F1 or Ctrl+Shift+P to open command palette
2. Type "Insert Citation"
3. Select the command from the list

## Expected Dialog Features

When the citation dialog opens, you should see:

✅ **Search functionality**: Type to filter citations by title, author, or key
✅ **Citation list**: Scrollable list showing title, author, key, and year
✅ **Click to select**: Click any citation to select it
✅ **Visual feedback**: Selected citation highlighted in blue
✅ **Insert button**: Enabled only when a citation is selected
✅ **Cancel button**: Close dialog without inserting
✅ **Escape key**: Press ESC to close dialog

## Test Citations

If BibTeX files are loaded, you should see citations available for insertion.

Try searching for common terms like:
- "hegel"
- "philosophy"
- "dialectic"
- "consciousness"

## Sample Inserted Citations

Below are examples of what citations should look like when inserted:

*Insert citations here during testing:*

-

## Expected Behavior

After selecting and inserting a citation:

1. ✅ Citation appears at cursor position in format: `[@citationkey]`
2. ✅ Cursor moves to end of inserted citation
3. ✅ Success notification appears
4. ✅ Dialog closes automatically
5. ✅ Citation is ready for bibliography processing

## Troubleshooting

If citations don't appear:
- Check that BibTeX files (.bib) are present in the project
- Ensure citations are properly formatted in BibTeX files
- Look for console messages about BibTeX loading

## Advanced Features

- **Multiple citations**: You can insert multiple citations: `[@key1; @key2; @key3]`
- **Page references**: Manually add page numbers: `[@key1, p. 42]`
- **Citation styles**: The format supports various citation processors (Pandoc, etc.)

---

**Happy citing! 📚✨**

Test completed successfully if you can insert citations using any of the methods above.