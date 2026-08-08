# Contributing to NightOwl

Thank you for your interest in contributing to NightOwl!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/night-owl.git`
3. Use Node.js 20 or newer and install dependencies: `npm ci`
4. Create a focused branch: `git switch -c feature/your-feature-name`

## Development

```bash
# Run in development mode with hot reload
npm run electron-dev

# Run tests
npm run test:unit        # Unit tests
npm run test:e2e         # E2E tests (requires display)
npm run test:all         # All tests

# Run deterministic performance budgets when relevant
npm run benchmark:performance

# Run the repository-owned pre-push gate
npm run ci:local
```

See [Local CI](docs/development/LOCAL_CI.md) for worktree dependency reuse,
release checks, capability skips, and the optional pre-push hook.
See [Architecture](ARCHITECTURE.md) for process/directory ownership and
[Build and Release](docs/development/BUILD_AND_RELEASE.md) for generated assets,
packaged smoke, signing, and hosted release steps.

## Workplan and generated files

- Capture scheduled bugs, refactors, and enhancements in `workplan/items/`.
- Run `npm run wp:render` after changing an item; do not hand-edit
  `workplan/BOARD.md` or `workplan/board.json`.
- Edit presentation JSX in
  `plugins/techne-presentations/src/MarkdownPreziApp.jsx`, run
  `npm run presentation:build`, and commit the generated runtime with it.
- Never commit `dist/`, `test-results/`, Playwright reports, `.env`, credentials,
  or user/workspace data.

## Pull Request Process

1. Ensure local CI passes: `npm run ci:local` (or `ci:local:release` for packaging).
2. Update the authored workplan item and regenerate the board when applicable.
3. Update documentation and generated assets owned by the changed boundary.
4. Use clear, descriptive commit messages.
5. Reference the related workplan item or issue in the pull request.

## Code Style

- Use consistent indentation (4 spaces)
- Add JSDoc comments for public functions
- Keep functions focused and small
- Write tests for new features

## Reporting Bugs

Please include:
- NightOwl version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Console logs or screenshots if applicable

## Feature Requests

Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Alternative approaches considered

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
