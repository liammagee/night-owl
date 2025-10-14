# Citation Drag & Drop Feature Test

This document tests the new drag-and-drop functionality for citations from the sidebar to the editor.

## Feature Overview

The citation drag-and-drop feature allows you to:
- **Drag citations** directly from the citations sidebar panel
- **Drop them** into the editor at any cursor position
- **Visual feedback** during the drag operation
- **Automatic insertion** of properly formatted citations: `[@citationkey]`

## Prerequisites

Before testing, ensure:
1. ✅ Citations sidebar is visible (click 📚 button in left sidebar)
2. ✅ Citations are loaded (from BibTeX files or citation manager)
3. ✅ Monaco editor is active and ready

## Testing Instructions

### Step 1: Open Citations Sidebar
1. Click the **📚 Citations** button in the left sidebar toggle area
2. Verify the citations panel opens with your loaded citations
3. If no citations appear, check that BibTeX files are loaded or add some via the citation manager

### Step 2: Test Basic Drag & Drop
1. **Start Drag**: Click and hold on any citation in the citations panel
2. **Visual Feedback**:
   - Citation should show drag cursor (grabbing hand)
   - Custom drag image should appear (green pill with citation text)
   - Original citation should become semi-transparent
3. **Drag to Editor**: Drag the citation over the editor area
4. **Editor Feedback**: Editor should show green tint indicating valid drop zone
5. **Drop**: Release mouse button to drop the citation
6. **Result**: Citation should be inserted at cursor position as `[@citationkey]`

### Step 3: Test Multiple Citations
Drag and drop several different citations to verify:
- ✅ Each citation uses correct format
- ✅ Citations insert at current cursor position
- ✅ Cursor moves to end of inserted text
- ✅ Multiple citations can be dropped in sequence

### Step 4: Test Visual Feedback
During drag operations, verify:
- ✅ **Draggable Indicator**: Citations show green border/shadow on hover
- ✅ **Drag State**: Citation becomes semi-transparent during drag
- ✅ **Custom Drag Image**: Green pill showing `📚 [@key]`
- ✅ **Drop Zone**: Editor shows green background when citation is over it
- ✅ **Reset**: All visual feedback clears after drop

### Step 5: Test Different Citation Types
Try dragging different types of citations:
- 📄 Articles
- 📚 Books
- 🌐 Web pages
- 📊 Reports
- 🎓 Theses

All should work identically regardless of citation type.

## Expected Results

### Successful Drag Operation
```markdown
Original text [@draggedcitation] more text
```

### Console Logs
Look for these console messages:
- `[Citation Drag] Starting drag for citation: citationkey`
- `[Citation Drop] Dropped citation: citationkey`
- `[Citation Drop] Inserted citation: [@citationkey]`

### Notifications
- Success notification: "Citation inserted: citationkey"

## Advanced Testing

### Test Edge Cases
1. **Empty Editor**: Drop citation in completely empty document
2. **Middle of Text**: Drop citation in the middle of existing text
3. **Multiple Lines**: Drop citation on different lines
4. **Special Characters**: Test citations with special characters in keys

### Test Integration
1. **Preview Update**: Verify preview pane updates after citation insertion
2. **Autocomplete**: Test that autocomplete still works after drag-dropped citations
3. **Undo/Redo**: Verify dropped citations can be undone (Ctrl+Z)

## Sample Test Citations

*Test by dragging any of these citation examples:*

**Dropped Citations Will Appear Below:**

---

*Drop citations from the sidebar here during testing...*

<!-- This space intentionally left for testing -->


## Troubleshooting

### Citations Don't Appear in Sidebar
- Check that BibTeX files are loaded
- Verify citation manager is initialized
- Try refreshing citations (🔃 Refresh button)

### Drag Doesn't Work
- Ensure cursor changes to "grab" on hover
- Check console for error messages
- Verify citations sidebar is visible and loaded

### Drop Doesn't Insert
- Check that editor is focused
- Verify cursor is positioned in editor
- Look for console logs about drop events

### No Visual Feedback
- Check browser drag-and-drop support
- Verify CSS styles are loading correctly
- Try with different citation items

## Feature Benefits

✨ **Improved Workflow**: No need to remember citation keys
🎯 **Precise Insertion**: Drop exactly where you want the citation
👀 **Visual Clarity**: Clear feedback during the entire process
🚀 **Speed**: Much faster than typing or using dialog boxes
📚 **Integration**: Works seamlessly with existing citation system

---

**Happy dragging and dropping! 🎯📚**

*Test completed successfully if you can drag citations from sidebar and drop them into this document.*