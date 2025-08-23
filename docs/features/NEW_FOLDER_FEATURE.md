# New Folder Feature

## Overview
The "New Folder" feature allows users to create new folders directly from within the application's file tree view.

## How to Use

1. **Switch to Files View**: Click the "Files" tab in the left sidebar
2. **Create New Folder**: Click the "+ Folder" button in the header
3. **Enter Folder Name**: A dialog will prompt you to enter the folder name
4. **Folder Created**: The new folder will appear in the file tree

## Features

- **Smart Validation**: Folder names are validated to ensure they contain only safe characters (letters, numbers, spaces, hyphens, underscores)
- **Duplicate Prevention**: The system checks if a folder with the same name already exists
- **Auto-Refresh**: The file tree automatically refreshes to show the new folder
- **Error Handling**: Clear error messages are displayed if folder creation fails

## Technical Implementation

### UI Components
- **New Folder Button**: Added to the structure pane header, only visible in Files view
- **Folder Name Dialog**: Uses browser's native `prompt()` for simplicity

### Backend Processing
- **IPC Handler**: `create-folder` handler in main.js
- **File System Operations**: Uses Node.js built-in `fs.mkdir()` with recursive option
- **Path Resolution**: Creates folders in the current working directory

### File Tree Integration
- **Automatic Refresh**: File tree updates immediately after folder creation
- **Proper Display**: New folders appear with appropriate folder icons and styling

## Validation Rules

Folder names must:
- Not be empty or contain only whitespace
- Only contain: letters (a-z, A-Z), numbers (0-9), spaces, hyphens (-), underscores (_)
- Not conflict with existing folder names in the same directory

## Error Handling

The system handles several error cases:
- **Empty Names**: User cancels or enters empty folder name
- **Invalid Characters**: Non-alphanumeric characters (except spaces, hyphens, underscores)
- **Duplicate Names**: Folder already exists with the same name
- **File System Errors**: Permissions issues or disk space problems

## Future Enhancements

Potential improvements for the future:
- Context menu integration (right-click to create folder)
- Nested folder creation with path input
- Folder templates or predefined structures
- Bulk folder operations
- Drag-and-drop folder organization