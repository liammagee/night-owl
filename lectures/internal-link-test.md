# Internal Link Test

This file tests the Cmd/Ctrl+click functionality for internal links.

## Instructions for Testing

1. **Normal click**: Regular clicks on internal links should not open the file (default behavior)
2. **Cmd+click (Mac)** or **Ctrl+click (Windows/Linux)**: Should automatically open the linked file

## Test Links

Here are some internal links to test with:

- Link to lecture 8: [[lecture-8]]
- Link to lecture 7: [[479-lecture-7]]
- Link to lecture 6: [[479-lecture-6]]
- Link with custom display text: [[lecture-5|Click here for Lecture 5]]
- Link to a specific section: [[lecture-4#synthesis]]

## Expected Behavior

- **Regular click**: Nothing happens (prevents default link behavior)
- **Cmd/Ctrl+click**: Opens the target file in the editor
- **Console logging**: Should see "[Internal Link] Opening: filename.md" in the developer console

## External Links (Should Not Be Affected)

Regular markdown links should still work normally:
- [External link](https://example.com) - opens in browser with regular click