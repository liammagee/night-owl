# Markdown Formatting Feature

## Overview
The Markdown Formatting feature provides a comprehensive toolbar and keyboard shortcuts for easy markdown editing within the Monaco editor, making it simple to format text without memorizing markdown syntax.

## Toolbar Location
The formatting toolbar is located at the top of the editor pane, containing all essential markdown formatting tools organized into logical groups.

## Available Formatting Tools

### 📝 Text Formatting
- **Bold** (`**B**`) - Makes selected text bold or inserts placeholder
  - Button: **B** button 
  - Shortcut: `Ctrl+B` (Cmd+B on Mac)
  - Markdown: `**text**`

- **Italic** (`*I*`) - Makes selected text italic or inserts placeholder  
  - Button: *I* button
  - Shortcut: `Ctrl+I` (Cmd+I on Mac)
  - Markdown: `*text*`

- **Inline Code** (`` `code` ``) - Formats text as inline code
  - Button: `code` button
  - Shortcut: `Ctrl+`` (Cmd+` on Mac)
  - Markdown: `` `text` ``

### 📋 Headings
- **Heading 1** (H1) - Creates or converts line to H1
  - Button: **H1** button
  - Markdown: `# Heading`

- **Heading 2** (H2) - Creates or converts line to H2
  - Button: **H2** button  
  - Markdown: `## Heading`

- **Heading 3** (H3) - Creates or converts line to H3
  - Button: **H3** button
  - Markdown: `### Heading`

### 📋 Lists & Quotes
- **Bulleted List** (• List) - Creates or converts to bulleted list
  - Button: • List button
  - Markdown: `- Item`

- **Numbered List** (1. List) - Creates or converts to numbered list
  - Button: 1. List button
  - Markdown: `1. Item`

- **Blockquote** (> Quote) - Creates or converts to blockquote
  - Button: > Quote button
  - Markdown: `> Quote text`

### 🔗 Links & Media
- **Insert Link** (🔗 Link) - Creates markdown links
  - Button: 🔗 Link button
  - Shortcut: `Ctrl+K` (Cmd+K on Mac)
  - Prompts for URL and link text
  - Markdown: `[text](url)`

- **Insert Image** (🖼️ Image) - Creates markdown images
  - Button: 🖼️ Image button
  - Prompts for image URL and alt text
  - Markdown: `![alt](url)`

- **Insert Table** (📊 Table) - Creates markdown tables
  - Button: 📊 Table button
  - Prompts for rows and columns
  - Creates complete table with headers and separators

## Smart Formatting Behavior

### Text Selection
- **With Selection**: Wraps selected text with formatting
- **Without Selection**: Inserts placeholder text and selects it for easy replacement

### Line-Based Formatting
- **Headings**: Automatically removes existing heading markers before applying new ones
- **Lists**: Converts selected lines to list items, preserving content
- **Quotes**: Applies blockquote formatting to selected lines

### Multi-Line Support
- **Lists and Quotes**: Work across multiple selected lines
- **Smart Content Preservation**: Existing formatting is intelligently replaced

## Usage Examples

### Bold Text
```
Selected: "consciousness"
Result: "**consciousness**"

No selection at cursor position:
Result: "**bold text**" (with "bold text" selected)
```

### Headings
```
Line: "Introduction to Phenomenology"
Click H2 button:
Result: "## Introduction to Phenomenology"

Line: "### Already a heading"
Click H1 button:  
Result: "# Already a heading"
```

### Lists
```
Selected lines:
"First concept"
"Second concept"  
"Third concept"

Click • List button:
Result:
"- First concept"
"- Second concept"
"- Third concept"
```

### Links
```
Selected: "Phenomenology of Spirit"
Click 🔗 Link, enter URL: "https://example.com"
Result: "[Phenomenology of Spirit](https://example.com)"
```

### Tables
```
Click 📊 Table, enter 3 rows, 2 columns:
Result:
| Header 1 | Header 2 |
| --- | --- |
| Data 1-1 | Data 1-2 |
| Data 2-1 | Data 2-2 |
```

## Keyboard Shortcuts

### Primary Shortcuts
- `Ctrl+B` / `Cmd+B` - Bold
- `Ctrl+I` / `Cmd+I` - Italic  
- `Ctrl+`` / `Cmd+`` - Inline code
- `Ctrl+K` / `Cmd+K` - Insert link

### Future Shortcuts (Extensible)
The system is designed to easily add more shortcuts for:
- `Ctrl+Shift+K` - Code block
- `Ctrl+H` - Headings (with numbers)
- `Ctrl+L` - Lists
- `Ctrl+Q` - Blockquotes

## Technical Implementation

### Monaco Editor Integration
- Uses Monaco's `executeEdits` API for undo/redo support
- Maintains cursor position and selection intelligently
- Updates live preview automatically after formatting

### Smart Text Processing  
- **Regex-based detection** of existing formatting
- **Content preservation** when changing formats
- **Selection management** for optimal user experience

### Event Handling
```javascript
// Example formatting function
function formatText(prefix, suffix, placeholder) {
    const selection = editor.getSelection();
    const selectedText = editor.getModel().getValueInRange(selection);
    
    if (selectedText) {
        // Wrap existing text
        const newText = prefix + selectedText + suffix;
        editor.executeEdits('format-text', [{
            range: selection,
            text: newText
        }]);
    } else {
        // Insert placeholder
        // ... (placeholder insertion logic)
    }
}
```

## User Interface Design

### Toolbar Layout
```
[**B**] [*I*] [`code`] | [H1] [H2] [H3] | [• List] [1. List] [> Quote] | [🔗 Link] [🖼️ Image] [📊 Table] | Format | [Other Tools...]
```

### Visual Feedback
- **Hover effects** on buttons
- **Visual button styling** matches function (bold button is bold)
- **Consistent spacing** and grouping
- **Dark mode support** with theme-aware colors

### Accessibility
- **Keyboard shortcuts** for all major functions
- **Tooltip descriptions** with shortcut hints
- **Focus management** returns to editor after formatting
- **Screen reader friendly** button labels

## Philosophy-Specific Enhancements

### Academic Writing Support
- **Blockquotes** perfect for philosophical quotations
- **Emphasis tools** for key concepts and terminology
- **Structured headings** for systematic philosophical exposition
- **Tables** for comparing philosophical positions

### Pedagogical Benefits
- **Visual formatting** reduces cognitive load
- **Consistent styling** improves document structure  
- **Quick access** to formatting encourages proper document organization
- **Professional output** suitable for academic publication

## Future Enhancements

### Advanced Formatting
- **Code blocks** with language selection
- **Mathematical equations** (LaTeX integration)
- **Footnotes** and citations
- **Custom styling** for philosophical concepts

### Enhanced UI
- **Format painter** (copy formatting between elements)
- **Format preview** (show result before applying)
- **Custom macros** for repeated formatting patterns
- **Format templates** for different document types

### Integration Features
- **Style guide enforcement** (academic formatting standards)
- **Auto-formatting** based on context
- **Import/export** with formatting preservation
- **Collaboration** with formatting conflict resolution

## Conclusion
The Markdown Formatting feature transforms the Hegel Pedagogy AI editor into a powerful, user-friendly markdown editing environment that bridges the gap between raw text editing and rich document creation, making it ideal for philosophical writing and academic work.