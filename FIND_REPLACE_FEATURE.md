# Find & Replace Feature

## Overview
The Find & Replace feature provides powerful search and replacement capabilities within the markdown editor, including support for regular expressions and various search options.

## How to Use

### Opening Find & Replace
- **Ctrl+F** (Cmd+F on Mac): Open Find dialog (search only)
- **Ctrl+H** (Cmd+H on Mac): Open Find & Replace dialog
- The dialog appears as a floating panel in the top-right corner

### Search Options
- **Case Sensitive**: Match exact case of letters
- **Regex**: Enable regular expression patterns
- **Whole Word**: Match only complete words

### Navigation
- **Find Next**: Navigate to next match (Enter or F3)
- **Find Previous**: Navigate to previous match (Shift+Enter or Shift+F3)
- **Replace**: Replace current match
- **Replace All**: Replace all matches at once

## Features

### Smart Search
- **Live Search**: Results update as you type
- **Visual Highlights**: All matches highlighted in editor
- **Current Match**: Active match shown with different color
- **Search Statistics**: Shows "X of Y" results

### Advanced Options
- **Regular Expressions**: Full regex support with pattern validation
- **Case Sensitivity Toggle**: Case-sensitive or insensitive search
- **Whole Word Matching**: Find complete words only
- **Wrap Around**: Search wraps to beginning when reaching end

### Keyboard Shortcuts
- **Ctrl/Cmd+F**: Open Find dialog
- **Ctrl/Cmd+H**: Open Find & Replace dialog
- **F3**: Find Next
- **Shift+F3**: Find Previous
- **Enter**: Find Next (from search box) or Replace (from replace box)
- **Escape**: Close dialog

## Usage Examples

### Basic Search
```
Search for: "concept"
Options: [none]
Result: Finds all instances of "concept" (case-insensitive)
```

### Case-Sensitive Search
```
Search for: "Hegel"
Options: ✓ Case sensitive
Result: Finds only "Hegel" (not "hegel")
```

### Whole Word Search
```
Search for: "the"
Options: ✓ Whole word
Result: Finds "the" but not "these" or "other"
```

### Regex Examples
```
Find: \b[A-Z][a-z]+\b
Options: ✓ Regex
Result: Finds capitalized words

Find: \d{4}
Options: ✓ Regex  
Result: Finds 4-digit numbers (years)

Find: \[(.*?)\]
Options: ✓ Regex
Result: Finds text within square brackets
```

### Replace Operations
```
Find: "old term"
Replace: "new term"
Action: Replace All
Result: All instances of "old term" become "new term"
```

## Technical Implementation

### Search Engine
- Uses JavaScript RegExp with configurable flags
- Supports global search with match positions
- Handles zero-length matches safely

### Monaco Editor Integration
- Uses Monaco's decoration API for highlighting
- Maintains editor focus during search
- Preserves cursor position and selections

### UI Components
- Floating dialog with clean design
- Dark/light mode support
- Responsive button layout
- Real-time statistics display

## Error Handling
- **Invalid Regex**: Shows warning for malformed patterns
- **No Results**: Displays "No results" message
- **Empty Search**: Clears highlights automatically
- **Editor Focus**: Maintains proper focus flow

## Accessibility
- Full keyboard navigation support
- Clear focus indicators
- Logical tab order
- Screen reader compatible labels

## Performance
- Efficient search algorithm for large documents
- Debounced live search to prevent lag
- Optimized highlighting with Monaco decorations
- Memory-conscious result caching

## Future Enhancements
- Search across multiple files
- Search history
- Saved search patterns
- Find in selection
- Replace with capture groups
- Search results panel