# Auto-Numbering Lists Feature

## Overview
The Auto-Numbering Lists feature provides intelligent list management within the Monaco editor, including automatic numbering, list continuation, indentation handling, and smart navigation behaviors that make list editing effortless and intuitive.

## Key Features

### 🔢 **Automatic Numbering**
- **Smart Continuation**: Press Enter in a numbered list to automatically create the next numbered item
- **Intelligent Sequencing**: Numbers increment properly (1. → 2. → 3.)
- **Context-Aware**: Maintains proper numbering even when editing middle of lists
- **Multiple List Support**: Handles multiple separate numbered lists in the same document

### 📝 **List Continuation**
- **Bulleted Lists**: Automatically continues with same bullet marker (-, *, +)
- **Numbered Lists**: Automatically increments to next number
- **Empty Item Exit**: Press Enter on empty list item to exit the list
- **Preserve Indentation**: Maintains proper spacing and alignment

### 🔄 **Smart Indentation**
- **Tab to Indent**: Press Tab to create nested list items
- **Shift+Tab to Outdent**: Press Shift+Tab to move items up a level
- **Nested Numbering**: Nested numbered lists start at 1 for each new level
- **Parent Numbering**: When outdenting, continues parent list numbering correctly

### 🎯 **Intelligent Behavior**
- **List Exit**: Double Enter or Enter on empty item exits list mode
- **Content Preservation**: Smart handling when breaking list items with content
- **Cursor Positioning**: Maintains optimal cursor position after operations
- **Undo/Redo Support**: All list operations support Monaco's undo system

## Usage Examples

### Basic Auto-Numbering
```markdown
Type: "1. First item"
Press Enter:
Result: 
1. First item
2. [cursor here]

Continue typing: "Second item"
Press Enter:
Result:
1. First item  
2. Second item
3. [cursor here]
```

### List Nesting with Tab
```markdown
Start with:
1. Main point
2. [cursor here]

Press Tab:
Result:
1. Main point
  1. [cursor here]

Continue:
1. Main point
  1. Sub-point
  2. [cursor here]

Press Shift+Tab:
Result:
1. Main point
  1. Sub-point
2. [cursor here]
```

### Bulleted List Continuation
```markdown
Type: "- First bullet"
Press Enter:
Result:
- First bullet
- [cursor here]

Press Tab:
Result:  
- First bullet
  - [cursor here]
```

### Smart List Exit
```markdown
Current:
1. Item one
2. [cursor here with no content]

Press Enter:
Result:
1. Item one

[cursor here - normal paragraph]
```

## Keyboard Shortcuts

### Primary Controls
- **Enter** - Continue list with next item or exit if empty
- **Tab** - Indent list item (create nested level)
- **Shift+Tab** - Outdent list item (move to parent level)

### Advanced Operations
- **🔢 Renumber Button** - Renumber all lists in document to fix sequence
- **Ctrl+B/I** - Format list content (works within list items)
- **Standard editing** - Cut, copy, paste work intelligently with lists

## Renumbering Feature

### Manual Renumbering
- **Renumber Button**: Click "🔢 Renumber" in toolbar
- **Fixes Sequences**: Corrects all numbered lists to proper 1, 2, 3... sequence
- **Handles Multiple Lists**: Processes all numbered lists in the document
- **Preserves Structure**: Maintains indentation and nesting

### When to Use Renumbering
- After copying/pasting list items
- When manually editing list numbers
- After reordering list items
- When list numbers become inconsistent

## Smart List Detection

### Supported List Formats
```markdown
Numbered Lists:
1. Item
2. Item
  1. Nested item
  2. Nested item

Bulleted Lists:
- Item  
* Item
+ Item
  - Nested item
  * Nested item
```

### Context Awareness
- **List Boundaries**: Recognizes where lists start and end
- **Indentation Levels**: Tracks nesting depth automatically
- **Mixed Lists**: Handles documents with both numbered and bulleted lists
- **Content Preservation**: Maintains list content during formatting changes

## Technical Implementation

### Monaco Editor Integration
```javascript
// Custom Enter key handler
editor.addCommand(monaco.KeyCode.Enter, () => {
    handleListEnterKey();
});

// Tab indentation handler  
editor.addCommand(monaco.KeyCode.Tab, () => {
    if (handleListIndentation(true)) {
        return; // Handled as list operation
    }
    return false; // Fall back to default Tab
});
```

### List Detection Logic
```javascript
// Regex pattern for list detection
const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
// Groups: [full, indentation, marker, content]
```

### Numbering Algorithm
```javascript  
function getNextListNumber(currentLine, indent) {
    // Look backward to find last number at same indent level
    // Increment appropriately for continuation
    // Handle nested list numbering reset
}
```

## Philosophy-Specific Benefits

### Academic Structure
- **Thesis Organization**: Perfect for structured philosophical arguments
- **Hierarchical Concepts**: Natural nesting for complex philosophical systems
- **Systematic Presentation**: Numbered points for logical progression
- **Clear Delineation**: Organized presentation of philosophical positions

### Pedagogical Applications
- **Lecture Outlines**: Structured content for teaching
- **Step-by-Step Arguments**: Logical progression through complex ideas
- **Student Exercises**: Numbered questions and structured assignments
- **Reading Lists**: Organized bibliographies and source materials

### Research Organization
- **Argument Mapping**: Structured breakdown of philosophical arguments
- **Evidence Lists**: Organized presentation of supporting points
- **Counter-Arguments**: Systematic listing of objections and responses
- **Citation Organization**: Structured reference management

## User Experience Enhancements

### Visual Feedback
- **Real-time Numbering**: Numbers update immediately as you type
- **Consistent Spacing**: Proper alignment maintained automatically
- **Cursor Positioning**: Optimal placement after each operation
- **Preview Updates**: Live preview reflects list changes instantly

### Error Prevention
- **Smart Exit**: Prevents accidental list creation
- **Content Protection**: Preserves text when changing list types
- **Undo Safety**: All operations reversible with Ctrl+Z
- **Format Consistency**: Maintains proper markdown format

### Accessibility
- **Keyboard-First**: All operations accessible via keyboard
- **Predictable Behavior**: Consistent response to user actions
- **Clear Feedback**: Obvious results from each operation
- **Standard Compliance**: Follows common editor conventions

## Future Enhancements

### Advanced Features
- **Custom Numbering**: Roman numerals, letters (a, b, c)
- **Multi-level Templates**: Pre-defined nested list structures
- **List Conversion**: Convert between numbered and bulleted lists
- **Smart Reordering**: Drag and drop with automatic renumbering

### Integration Features
- **Outline Mode**: Collapsible list view for navigation
- **Export Options**: Proper list formatting in PDF/HTML export
- **Citation Integration**: Automatic numbering for references
- **Template Lists**: Saved list structures for reuse

## Troubleshooting

### Common Issues
- **Numbers Out of Sequence**: Use "🔢 Renumber" button to fix
- **Wrong Indentation**: Use Tab/Shift+Tab to adjust nesting
- **List Won't Exit**: Press Enter twice or Enter on empty item
- **Mixed Formatting**: Renumber button fixes inconsistencies

### Best Practices
- **Consistent Markers**: Stick to one bullet type per list
- **Proper Nesting**: Use Tab for indentation, not manual spaces
- **Regular Renumbering**: Use renumber feature after major edits
- **Content First**: Focus on content, let auto-numbering handle formatting

## Conclusion
The Auto-Numbering Lists feature transforms list editing from a manual formatting task into an intuitive, intelligent writing experience. Perfect for philosophical discourse, academic writing, and structured content creation, it maintains proper formatting automatically while allowing writers to focus on ideas rather than mechanics.