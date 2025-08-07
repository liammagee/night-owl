# Global Search Feature

## Overview
The Global Search feature provides powerful search capabilities across all files in your working directory, allowing you to quickly find content across multiple documents.

## How to Use

### Opening Global Search
- **Ctrl+Shift+F** (Cmd+Shift+F on Mac): Open Global Search panel
- Click the **Search** button in the right pane toolbar
- The search panel appears in the right pane alongside Preview and AI Chat

### Search Interface
- **Search Input**: Enter your search query
- **Search Options**:
  - **Case Sensitive**: Match exact case of letters
  - **Regex**: Enable regular expression patterns  
  - **Whole Word**: Match only complete words
  - **File Pattern**: Filter files (default: `*.{md,markdown,txt}`)
- **Search Button**: Execute the search or press Enter

### Search Results
- Results are grouped by file with match counts
- Click any result to open the file at that location
- Line numbers show exact locations of matches
- Search terms are highlighted in results

## Features

### Smart Search
- **Fast File Scanning**: Recursively searches all files in working directory
- **Multiple File Types**: Supports Markdown (.md), text (.txt), and other formats
- **Live Results**: Click results to jump directly to matches
- **Context Display**: Shows surrounding lines for better context

### Advanced Options
- **Regular Expressions**: Full regex support with pattern validation
- **Case Sensitivity Toggle**: Case-sensitive or insensitive search
- **Whole Word Matching**: Find complete words only
- **File Pattern Filtering**: Control which file types to search

### Keyboard Shortcuts
- **Ctrl/Cmd+Shift+F**: Open Global Search
- **Enter**: Execute search (from search input)
- **Escape**: Close search panel

## Usage Examples

### Basic Search
```
Search for: "consciousness"
Options: [none]
Result: Finds all instances of "consciousness" across all files
```

### Case-Sensitive Search
```
Search for: "Hegel"
Options: ✓ Case sensitive
Result: Finds only "Hegel" (not "hegel")
```

### Whole Word Search
```
Search for: "being"
Options: ✓ Whole word
Result: Finds "being" but not "wellbeing" or "beings"
```

### Regex Examples
```
Search: \b[A-Z][a-z]+\b
Options: ✓ Regex
Result: Finds capitalized words

Search: \d{4}
Options: ✓ Regex  
Result: Finds 4-digit numbers (years)

Search: \[\[(.*?)\]\]
Options: ✓ Regex
Result: Finds wiki-style links [[content]]
```

### File Pattern Filtering
```
File Pattern: *.md
Result: Search only Markdown files

File Pattern: lecture*.md
Result: Search only lecture Markdown files

File Pattern: *.{md,txt}
Result: Search Markdown and text files
```

## Technical Implementation

### Backend Search Engine
- **Node.js File System**: Uses fs.promises for async file operations
- **Recursive Directory Scanning**: Traverses subdirectories automatically
- **Regex Engine**: JavaScript RegExp with configurable flags
- **Performance Optimized**: Limits results and skips binary/hidden files

### Frontend Integration
- **IPC Communication**: Electron main/renderer process communication
- **Monaco Editor Integration**: Jump to specific line/column positions
- **Navigation History**: Integrates with forward/back navigation
- **Real-time UI Updates**: Live search status and result display

### File Type Support
- **Markdown Files**: .md, .markdown
- **Text Files**: .txt, .text
- **Extensible**: Easy to add more file types
- **Smart Filtering**: Ignores node_modules, .git, hidden folders

## Performance Considerations
- **Result Limiting**: Maximum 500 matches to prevent UI lag
- **Directory Filtering**: Skips common build/cache directories
- **Memory Efficient**: Streams files rather than loading all into memory
- **Error Handling**: Gracefully handles unreadable files

## Navigation Integration
- **File Opening**: Automatically opens files from search results
- **Editor Positioning**: Jumps to exact line and column
- **History Tracking**: Search result navigation is added to history
- **Current File Updates**: Updates window title and status

## Error Handling
- **Invalid Regex**: Shows clear error messages for malformed patterns
- **File Access**: Handles permission errors gracefully
- **Empty Results**: Provides helpful "No matches found" message
- **Search Cancellation**: Prevents overlapping searches

## Future Enhancements
- **Search History**: Remember previous search queries
- **Replace in Files**: Global find and replace functionality  
- **Search Filters**: Filter by file modification date, size, etc.
- **Search Scope**: Limit search to selected folders
- **Export Results**: Save search results to file
- **Advanced Regex Builder**: Visual regex construction tool