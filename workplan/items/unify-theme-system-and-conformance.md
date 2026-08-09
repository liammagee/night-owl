---
id: "unify-theme-system-and-conformance"
title: "Unify theme tokens and enforce visual conformance"
status: "triaged"
type: "refactor"
priority: "P2"
area: "accessibility"
owner: "unassigned"
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

- [ ] A versioned machine-readable contract validates required theme metadata,
  token names, and parseable values.
- [ ] All foreground/background, interaction, focus, and status pairs pass the
  contrast requirements in the design brief after alpha compositing.
- [ ] Accent interaction states retain one recognizable hue family and status
  colors retain invariant meaning.
- [ ] A deterministic component gallery renders every required state for all
  built-in themes and supports screenshot comparison.
- [ ] The custom theme editor previews and validates the same semantic roles and
  versions imported/exported themes.
- [ ] Shared application and plugin chrome consume canonical roles rather than
  unowned literal colors or theme IDs.
- [ ] Legacy aliases remain one-way adapter output during migration, then
  competing theme-token ownership is retired.
- [ ] Required local and hosted CI run contract, contrast, Axe, and Electron
  theme-conformance checks.
