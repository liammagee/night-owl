# NightOwl

**Advanced Markdown editor and presentation app for philosophical writing and teaching.**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Release](https://img.shields.io/github/v/release/liammagee/night-owl)](https://github.com/liammagee/night-owl/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/liammagee/night-owl/releases)

NightOwl is a desktop application built with Electron that combines a powerful Monaco-based Markdown editor with presentation capabilities, AI integration, and a unique "Babel Maze" exploration mode for navigating interconnected documents.

Part of the [Machine Spirits](https://machinespirits.org) project.

## Download

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| macOS (Intel) | [NightOwl-x64.dmg](https://github.com/liammagee/night-owl/releases/latest) |
| macOS (Apple Silicon) | [NightOwl-arm64.dmg](https://github.com/liammagee/night-owl/releases/latest) |
| Windows | [NightOwl-Setup.exe](https://github.com/liammagee/night-owl/releases/latest) |
| Linux | [NightOwl.AppImage](https://github.com/liammagee/night-owl/releases/latest) |

## Features

- **Monaco Editor** - Full-featured code editor with Markdown syntax highlighting and split preview
- **Visual Markdown** - Inline image previews, collapsible code blocks, wiki-style `[[links]]`
- **Presentation Mode** - Create and present slides directly from Markdown
- **Babel Maze** - MUD-style exploration of interconnected Markdown documents
- **AI Integration** - Chat, summarization, and note extraction with multiple AI providers
- **Citation Management** - SQLite-backed citation database with BibTeX support
- **Graph Visualization** - Force-directed graph of document relationships
- **Plugin System** - Extensible via Techne plugins

## Quick Start

```bash
# Clone the repository
git clone https://github.com/liammagee/night-owl.git
cd night-owl

# Install dependencies
npm install

# Run in development mode
npm run electron-dev

# Or build for production
npm run dist
```

## AI Configuration

NightOwl supports multiple AI providers. To enable AI features:

1. Copy `.env.example` to `.env`
2. Add your API key(s) for the provider(s) you want to use:

```bash
# OpenAI - https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-key-here

# Anthropic - https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Google Gemini - https://makersuite.google.com/app/apikey
GOOGLE_API_KEY=your-key-here

# Groq - https://console.groq.com/
GROQ_API_KEY=gsk_your-key-here

# OpenRouter - https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-your-key-here
```

You only need to configure the providers you plan to use. The application auto-detects available providers.

### AI Settings

Configure AI behavior in the Settings dialog or via `settings.json`:

| Setting | Description | Default |
|---------|-------------|---------|
| `preferredProvider` | Which AI to use (`auto`, `openai`, `anthropic`, `gemini`, `groq`, `openrouter`) | `auto` |
| `temperature` | Response creativity (0.0 - 2.0) | `0.7` |
| `maxTokens` | Maximum response length | `2000` |

Settings are stored in:
- **macOS**: `~/Library/Application Support/NightOwl/settings.json`
- **Windows**: `%APPDATA%/NightOwl/settings.json`
- **Linux**: `~/.config/NightOwl/settings.json`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+O` | Open file |
| `Cmd/Ctrl+P` | Quick file open |
| `Cmd/Ctrl+Shift+P` | Command palette |
| `Cmd/Ctrl+\` | Toggle preview |
| `F5` | Start presentation |
| `Cmd/Ctrl+Click` | Follow wiki link |

## Versioning

NightOwl follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (x.0.0): Breaking changes
- **MINOR** (0.x.0): New features, backwards compatible
- **PATCH** (0.0.x): Bug fixes

Pre-release versions use suffixes: `1.0.0-beta.1`, `1.0.0-alpha.2`

## Reporting Issues

Found a bug or have a feature request?

1. Check [existing issues](https://github.com/liammagee/night-owl/issues)
2. Create a [new issue](https://github.com/liammagee/night-owl/issues/new) with:
   - NightOwl version and OS
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

```bash
# Run tests
npm run test:all

# Run E2E tests (requires display)
npm run test:e2e
```

## Related Projects

- [Machine Spirits](https://machinespirits.org) - AI-augmented Learning Management System
- [Techne Plugins](https://github.com/liammagee/techne-plugins) - Shared plugin ecosystem

## License

[Apache License 2.0](LICENSE)

---

Built with [Electron](https://www.electronjs.org/), [Monaco Editor](https://microsoft.github.io/monaco-editor/), and [marked](https://marked.js.org/).
