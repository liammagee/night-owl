# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is NightOwl - an advanced markdown editor and presentation platform for philosophical writing and teaching, with a focus on Hegelian philosophy and AI-powered pedagogical tools.

## Project Status

NightOwl is an Electron/Node application with a Monaco renderer, fixed preload
capabilities, bundled app-native features, Jest projects, and real Electron
Playwright gates. It is not a Python project; Python is only an optional helper
runtime for some document conversion and native-module build environments.

## Development Commands

- `npm ci` — install the committed dependency tree.
- `npm run electron-dev` — run the development app.
- `npm run ci:local` — run the branch gate.
- `npm run ci:local:release` — add distribution preflight.
- `npm run benchmark:performance` — run fixed readiness budgets.

## Architecture

Read [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) and
[`BUILD_AND_RELEASE.md`](BUILD_AND_RELEASE.md). Track live work only in
[`../../workplan/BOARD.md`](../../workplan/BOARD.md).
