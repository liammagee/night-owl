# Contributing to NightOwl

Thank you for your interest in contributing to NightOwl!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/night-owl.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development

```bash
# Run in development mode with hot reload
npm run electron-dev

# Run tests
npm run test:unit        # Unit tests
npm run test:e2e         # E2E tests (requires display)
npm run test:all         # All tests
```

## Pull Request Process

1. Ensure tests pass: `npm run test:all`
2. Update documentation if needed
3. Use clear, descriptive commit messages
4. Reference any related issues

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
