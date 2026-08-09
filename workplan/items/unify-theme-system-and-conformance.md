---
id: "unify-theme-system-and-conformance"
title: "Unify theme tokens and enforce visual conformance"
status: "done"
type: "refactor"
priority: "P2"
area: "accessibility"
owner: "codex"
source: "user-report"
evidence: "source-analysis"
created: "2026-08-10"
updated: "2026-08-10"
verification: "Every built-in theme passes the versioned token, contrast, component-gallery, Axe, and required Electron conformance checks documented in THEME_DESIGN_BRIEF.md."
tags: ["themes", "design-system", "color", "a11y", "css"]
depends_on: ["accessible-names-and-presentation-semantics", "consolidate-presentation-source-and-styles"]
---

## Context

The managed Techne tokens, legacy NightOwl variables, feature-specific literal
colors, and separate Techne aesthetic stylesheet each act as partial theme
authorities. High-specificity adapter rules conceal many disagreements, but
adjacent components can still use inconsistent surfaces, selected states,
muted text, or status colors. Only part of the 12-theme matrix receives current
computed-style coverage.

The design contract and migration boundary are documented in
`docs/development/THEME_DESIGN_BRIEF.md`.

## Proposed change

Make canonical semantic Techne roles the only theme input contract. Add missing
on-accent, focus, selection, link, and status-surface roles; validate all
built-in and custom themes; migrate component literals and competing aliases;
and add a deterministic gallery plus real Electron conformance coverage.

## Acceptance criteria

- [x] A versioned machine-readable contract validates required theme metadata,
  token names, and parseable values.
- [x] All foreground/background, interaction, focus, and status pairs pass the
  contrast requirements in the design brief after alpha compositing.
- [x] Accent interaction states retain one recognizable hue family and status
  colors retain invariant meaning.
- [x] A deterministic component gallery renders every required state for all
  built-in themes and supports screenshot comparison.
- [x] The custom theme editor previews and validates the same semantic roles and
  versions imported/exported themes.
- [x] Shared application and plugin chrome consume canonical roles rather than
  unowned literal colors or theme IDs.
- [x] Legacy aliases remain one-way adapter output during migration, then
  competing theme-token ownership is retired.
- [x] Required local and hosted CI run contract, contrast, Axe, and Electron
  theme-conformance checks.

## Implementation evidence

- Contract v1 validates 22 required roles, metadata, alpha-composited contrast,
  accent-family continuity, and distinct status meaning across all 12 built-ins.
- The component gallery exposes six deterministic state cards and is available
  through command `theme.gallery`.
- Custom themes normalize legacy aliases, report failing pairs and ratios live,
  reject invalid saves/imports, and export the contract version.
- Required Electron coverage applies every built-in plus a custom theme, samples
  shared application chrome, and runs Axe against the gallery in every palette.

## Outcome

Theme definitions now flow through one versioned semantic contract. All 12
built-ins pass the palette and contrast audit, custom themes use the same rules,
and shared NightOwl chrome receives one-way canonical role mappings. Designers
can review every required component state in the gallery before selecting a
theme, while local and hosted CI reject regressions.

## Verification

- `npm run ci:local`: 7/7 stages passed.
- `npm run theme:check`: 12/12 built-in themes passed contract v1.
- Required Electron `@theme-conformance`: all built-ins, one custom theme,
  shared chrome computed styles, and 12 Axe gallery passes.
- GitHub `required-smoke`: passed on PR #37.
