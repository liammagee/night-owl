# Internal Links Enhancement

## Updated Functionality

The internal link system has been enhanced to provide a seamless navigation experience when clicking on `[[]]` style links.

## New Behavior

### When You Click an Internal Link:

1. **File Loading**: The linked file is loaded into both the **editor** and **preview** panes simultaneously
2. **Mode Switching**: If you're in presentation mode, the app automatically switches to editor mode
3. **Content Sync**: Both the editor and preview are updated with the file content immediately
4. **File Creation**: If the linked file doesn't exist, you're offered the option to create it

### Cross-Mode Navigation

- **From Editor/Preview**: Clicking internal links opens files in both editor and preview
- **From Presentation Mode**: Clicking internal links switches to editor mode and opens the file
- **Consistent Experience**: Internal links work the same way regardless of which view you're in

## Technical Implementation

### Editor Mode
```javascript
// When internal link is clicked:
1. File content is loaded via IPC call to main process
2. openFileInEditor() is called to update both panes
3. updatePreviewAndStructure() automatically refreshes preview
4. File tree updates to show current file selection
```

### Presentation Mode
```javascript
// When internal link is clicked in presentation:
1. App switches from presentation to editor mode
2. File content is loaded and displayed in editor
3. Preview pane is updated simultaneously
4. User can continue editing or switch back to presentation
```

## Benefits

- **Seamless Navigation**: No need to manually switch modes when following links
- **Dual View Updates**: Both editor and preview stay in sync
- **Context Preservation**: File directory context is maintained for image paths
- **Error Handling**: Clear feedback if files don't exist with creation option

## Usage Examples

```markdown
# My Document

See also: [[related-topic]] for more information.

For a detailed explanation, check [[concepts/advanced-ideas|Advanced Ideas]].

The [[summary]] provides a good overview.
```

When you click any of these links:
- File opens in both editor and preview
- You can immediately start editing or reading
- Images and other relative links work correctly
- File tree reflects the newly opened file

## File Creation Workflow

If a linked file doesn't exist:
1. Click the internal link
2. Get prompted: "File not found. Would you like to create it?"
3. Click "OK" to create the file with basic template content
4. New file opens in editor for immediate editing

This makes it easy to create connected documents on-the-fly while writing.