# NightOwl

Advanced Markdown editor and presentation app for philosophical writing and teaching.

## Running the Application

### Web Version
To run the web version in development mode:

```bash
npm run dev
```

This will start the application using tsx and you can access it in your browser.

### Electron Version
To run the Electron desktop application:

#### Development Mode
```bash
npm run electron-dev
```

#### Production Mode
```bash
npm run electron
```

### Building for Distribution

To build the Electron app for distribution:

```bash
npm run build
```

Or to build without publishing:

```bash
npm run dist
```

## Installation

### Basic Setup

First, install dependencies:

```bash
npm install
```

### Testing Setup

To run tests, you'll also need to install Playwright browsers:

```bash
npx playwright install
```

Then follow the running instructions above for your preferred version.

## Testing

This project includes comprehensive test coverage with unit tests, integration tests, and end-to-end (E2E) tests.

### Test Types

- **Unit Tests**: Test individual functions and components in isolation
- **Integration Tests**: Test IPC communication and file operations
- **E2E Tests**: Test complete user workflows in the actual Electron app

### Running Tests

#### Quick Test Setup Verification
```bash
npm run test:basic
```

#### Unit Tests Only
```bash
npm run test:unit
```

#### Integration Tests Only
```bash
npm run test:integration
```

#### End-to-End Tests (requires Playwright installation)
```bash
npm run test:e2e
```

**Note**: E2E tests are currently configured as simple demonstration tests. For comprehensive Electron app testing, you would need to manually launch the app (`npm run electron-dev`) and connect Playwright to the running instance.

#### All Tests
```bash
npm run test:all
```

#### Watch Mode (for development)
```bash
npm run test:watch
```

### Test Requirements

- **Unit & Integration Tests**: No additional setup required (uses Jest with mocked Electron APIs)
- **E2E Tests**: Requires Playwright browsers to be installed (`npx playwright install`)

### Troubleshooting Tests

If you encounter issues:

1. Ensure all dependencies are installed: `npm install`
2. For E2E tests, install Playwright browsers: `npx playwright install`
3. Run basic tests first to verify setup: `npm run test:basic`
4. Check the test setup guide: `tests/test-setup-guide.md`

The test infrastructure covers critical functionality including:
- Monaco editor integration
- File save/load operations
- Internal links processing (prevents regression of critical bug)
- IPC communication between main and renderer processes
- UI interactions and user workflows

## Configuration

### AI Settings Storage

AI settings are stored persistently in the application's user data directory as part of the main settings system.

**Storage Location:**
- Settings file: `settings.json` in the app's user data directory
- **macOS**: `~/Library/Application Support/Hegel Pedagogy AI/settings.json`
- **Windows**: `%APPDATA%/Hegel Pedagogy AI/settings.json`
- **Linux**: `~/.config/Hegel Pedagogy AI/settings.json`

**AI Configuration Structure:**
```javascript
{
  "ai": {
    "preferredProvider": "auto",  // 'auto', 'openai', 'anthropic', 'groq', 'openrouter'
    "models": {
      "openai": "gpt-4o",
      "anthropic": "claude-3-5-sonnet-20241022",
      "groq": "llama-3.1-70b-versatile",
      "openrouter": "anthropic/claude-3.5-sonnet"
    },
    "temperature": 0.7,           // 0.0 - 2.0 (automatically clamped)
    "maxTokens": 2000,
    "enableChat": true,
    "enableSummarization": true,
    "enableNoteExtraction": true,
    "chatHistory": {
      "persist": true,
      "maxEntries": 100,
      "autoSave": true
    },
    "responseFormat": "markdown"  // 'plain', 'markdown', 'html'
  }
}
```

**How it works:**
1. Settings are automatically loaded on application startup
2. Changes persist across app restarts
3. Settings can be modified through the application's Settings dialog
4. The main process validates settings (e.g., temperature values are clamped between 0-2)
5. IPC handlers manage settings operations:
   - `get-settings` - retrieves current settings
   - `set-settings` - saves updated settings
   - Settings export/import functionality available through the UI

**Provider Configuration:**
- Set your preferred AI provider or use "auto" for automatic selection
- Configure specific models for each provider
- Enable/disable individual AI features (chat, summarization, note extraction)
- Customize response formatting and chat history behavior