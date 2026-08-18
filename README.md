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
- **PowerPoint Files** - Preview complete PPTX decks through macOS Quick Look and open them directly in Microsoft PowerPoint (with system-open fallback elsewhere)
- **Babel Maze** - MUD-style exploration of interconnected Markdown documents
- **AI Integration** - Chat, summarization, and note extraction with multiple AI providers
- **Citation Management** - SQLite-backed citations plus page-linked PDF annotations and provenance-rich research notes
- **Structured Records** - Readable JSONL/CSV editing with optional task schemas, validation, and progress
- **Graph Visualization** - Force-directed graph of document relationships
- **Bundled Features** - App-native feature modules for presentation, preview, graph, maze, and feed workflows

## Quick Start

```bash
# Clone the repository
git clone https://github.com/liammagee/night-owl.git
cd night-owl

# Install dependencies
npm ci

# Run in development mode
npm run electron-dev

# Or build for production
npm run dist
```

## AI Configuration

NightOwl uses signed-in command-line assistants for text AI by default:

1. Install and sign in to [Codex CLI](https://learn.chatgpt.com/docs/codex-cli) and/or Claude CLI.
2. Leave the assistant provider on `auto`. NightOwl tries `codex-cli`, then `claude-cli`.

CLI requests run without tools in an isolated workspace. Direct API credentials are not inherited by these subprocesses. Automatic API fallback is off by default.

API providers remain available as explicit alternatives. To configure one:

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

You only need to configure the API providers you deliberately plan to use. Select a named provider in AI settings, or opt in to automatic API fallback.

The stateful tutor-stub CLI can also be launched from the Assistant terminal's `tutor` button. NightOwl auto-detects a sibling `machinespirits-eval` checkout; its path can be overridden in AI settings.

### AI Settings

Configure AI behavior in the Settings dialog or via `settings.json`:

| Setting | Description | Default |
|---------|-------------|---------|
| `preferredProvider` | Which AI to use (`auto`, `codex-cli`, `claude-cli`, or a named API provider) | `auto` |
| `providerPriority` | CLI order used by `auto` | `['codex-cli', 'claude-cli']` |
| `allowApiFallback` | Permit `auto` to use a configured API when both CLIs are unavailable | `false` |
| `tutorStub.repositoryPath` | Optional path to a `machinespirits-eval` checkout | auto-detect |
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

Contributions welcome! Start with [CONTRIBUTING.md](CONTRIBUTING.md), the
[architecture map](ARCHITECTURE.md), and the
[build/release chain](docs/development/BUILD_AND_RELEASE.md).

```bash
# Run the complete local branch gate
npm run ci:local

# Add distribution preflight for packaging changes
npm run ci:local:release

# Run deterministic startup/view performance budgets
npm run benchmark:performance

# After an unpacked build, verify packaged tutor-core storage
NIGHTOWL_PACKAGED_APP=dist/mac-arm64/NightOwl.app npm run test:e2e:packaged
```

Live engineering status belongs in the source-controlled
[workplan board](workplan/BOARD.md), not in architecture notes.

## Related Projects

- [Machine Spirits](https://machinespirits.org) - AI-augmented Learning Management System

## License

[Apache License 2.0](LICENSE)

---

Built with [Electron](https://www.electronjs.org/), [Monaco Editor](https://microsoft.github.io/monaco-editor/), and [marked](https://marked.js.org/).
