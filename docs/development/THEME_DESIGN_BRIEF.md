# NightOwl theme design brief

Status: design contract for built-in and custom application themes

Owner: NightOwl UI system

Applies to: application chrome, editor shell, file pane, preview shell, dialogs,
menus, toolbars, status bars, terminals, presenter controls, and plugin UI

## Outcome

Every NightOwl theme should feel like the same product expressed through a
different palette. A theme may change atmosphere, warmth, and accent identity;
it must not change the meaning of controls, flatten visual hierarchy, reduce
legibility, or introduce a second unrelated palette inside one workflow.

This brief is the source of truth for theme review. The implementation work is
tracked by `workplan/items/unify-theme-system-and-conformance.md`.

## Why this is needed

The current application combines three color systems:

1. canonical `--techne-*` tokens and built-in overrides in the theme-manager
   plugin;
2. legacy application variables such as `--primary`, `--text-color`,
   `--surface`, and `--neutral-*`;
3. feature CSS and inline styles containing their own literal colors.

The adapter then uses broad, high-specificity overrides to reconcile those
systems. This makes isolated components look correct while adjacent components
can still disagree about background, selected state, muted text, or semantic
color. There are currently 12 built-in themes, but conformance tests exercise
only part of the surface and primarily sample the two Solarized variants.

Examples of structural inconsistencies visible in source include:

- semantic success, warning, and error colors derived partly from the selected
  accent rather than retaining stable meaning;
- accent hover colors that change hue identity instead of behaving like the
  same control under interaction;
- `--techne-text-inverted` used as button text without proving contrast against
  every accent state;
- editor, preview, terminal, toolbar, and status surfaces repaired by direct
  selectors rather than sharing a reliable surface hierarchy;
- a separate `techne-theme` stylesheet that remaps many of the same variables
  independently of the managed theme definitions.

## Principles

### One product, many palettes

Layout, typography, spacing, shape, elevation, and interaction behavior remain
stable across themes. Themes alter color roles and optional restrained effects,
not component structure.

### Roles, not named colors

Components request a role such as canvas, raised surface, muted text, focus
ring, or error. They do not request red, blue, Solarized base03, or a theme ID.

### Hierarchy before decoration

Canvas, panel, and raised surfaces must be distinguishable without creating a
patchwork. Borders and elevation reinforce hierarchy; accent color is not a
substitute for hierarchy.

### Meaning is invariant

Success, warning, error, information, focus, selection, and disabled states
retain the same meaning in every theme. They are not generated from the brand
accent.

### Accessibility is a release condition

A palette that fails the required contrast or state checks is not a valid
NightOwl theme, even if it is aesthetically attractive.

### Color is never the only signal

Selected, invalid, successful, warning, and destructive states also use text,
icons, borders, position, or other non-color cues as appropriate.

## Token architecture

The target system has three layers and only one direction of dependency:

```text
theme definition -> canonical semantic tokens -> component styles
                                      |
                                      +-> temporary legacy aliases
```

### 1. Theme definition

A built-in or custom theme supplies only canonical `--techne-*` values. It
cannot contain component selectors or override NightOwl legacy variables.

### 2. Canonical semantic tokens

Canonical tokens define the supported visual roles. New theme-aware component
CSS consumes these tokens directly. A theme must provide or inherit a valid
value for every required role.

### 3. Component styles

Components may derive local values with `color-mix()` from semantic roles, but
must not create a new palette. Component variables describe anatomy rather than
theme identity, for example `--dialog-header-bg: var(--techne-surface)`.

The legacy adapter may map canonical roles to old names while existing CSS is
migrated. New aliases are not added without an explicit design-system reason.

## Required theme contract

The current token names remain valid where listed. Renames are introduced as
aliases first so custom themes can migrate safely.

| Group | Canonical role | Purpose |
| --- | --- | --- |
| Surfaces | `--techne-bg` | Application canvas and editor shell background |
| Surfaces | `--techne-surface` | Panels, sidebars, toolbars, terminal shell |
| Surfaces | `--techne-surface-elevated` | Menus, dialogs, popovers, raised cards |
| Text | `--techne-text` | Primary readable text and icons |
| Text | `--techne-text-muted` | Secondary readable text, metadata, placeholders |
| Text | `--techne-text-on-accent` | Text and icons on accent-filled controls |
| Accent | `--techne-accent` | Primary action, current selection, active navigation |
| Accent | `--techne-accent-hover` | Hover state of the same accent identity |
| Accent | `--techne-accent-active` | Pressed/current state of the same accent identity |
| Boundaries | `--techne-border` | Control and panel boundaries that convey structure |
| Boundaries | `--techne-border-subtle` | Low-emphasis separators and guides |
| Focus | `--techne-focus-ring` | Keyboard focus indication |
| Selection | `--techne-selection-bg` | Text and list selection background |
| Links | `--techne-link` | Interactive text link foreground |
| Status | `--techne-success` | Successful or clean state foreground |
| Status | `--techne-success-surface` | Successful state background |
| Status | `--techne-warning` | Caution or attention state foreground |
| Status | `--techne-warning-surface` | Caution state background |
| Status | `--techne-error` | Error or destructive state foreground |
| Status | `--techne-error-surface` | Error state background |
| Status | `--techne-info` | Neutral information state foreground |
| Status | `--techne-info-surface` | Neutral information state background |
| Effects | `--techne-glass-bg` | Optional translucent raised surface |
| Effects | `--techne-glass-border` | Boundary for that translucent surface |

`--techne-text-inverted` is a compatibility alias, not a design role. It should
resolve to `--techne-text-on-accent` until consumers are migrated.

Theme metadata must also declare a stable ID, display name, description, and
light/dark color-scheme. Custom theme exports include a contract version.

## Color and contrast rules

These are minimum requirements, not targets to barely meet.

| Pair or state | Requirement |
| --- | --- |
| Primary text on canvas, panel, and raised surface | WCAG contrast at least 4.5:1 |
| Muted text that conveys information | WCAG contrast at least 4.5:1 on every surface where used |
| Text/icons on accent, accent hover, and accent active | WCAG contrast at least 4.5:1 |
| Link text on its surface | WCAG contrast at least 4.5:1 and a non-color affordance on hover/focus |
| Status foreground on its status surface | WCAG contrast at least 4.5:1 |
| Input, button, selected, and focus boundaries | At least 3:1 against adjacent colors when the boundary conveys state |
| Focus ring | At least 3:1 against both the control and surrounding surface |
| Large or decorative text | May use the applicable WCAG exception; reusable controls may not rely on it |

Additional palette rules:

- Accent default, hover, and active values retain one recognizable hue family.
  Interaction changes lightness or chroma; it does not switch from green to
  pink, blue to orange, or another unrelated identity.
- Accent contrast is verified for all three interaction values, not only the
  default.
- Status colors remain distinct from one another and from the accent. A red
  accent does not turn every successful state red.
- Light and dark themes use explicit surface relationships. A dark theme is not
  produced by mechanically inverting a light theme.
- Canvas-to-panel and panel-to-raised differences are restrained but visible.
  If color alone does not distinguish them reliably, a semantic border or
  shadow must do so.
- Muted does not mean unreadable. Opacity-based muted colors are resolved and
  tested against their actual background.
- Pure black or pure white is not required. Use it only when it serves the
  palette and passes the same hierarchy checks.

## Component conformance matrix

| Surface | Default | Hover/active | Focus/selected | Semantic rule |
| --- | --- | --- | --- | --- |
| App canvas and editor shell | `bg` + `text` | n/a | selection token | No unrelated warm/cool patch between editor and preview shell |
| Sidebar, toolbar, status bar | `surface` + `text` | elevated or restrained accent mix | focus ring; active navigation uses accent | The active item remains legible in every accent state |
| Menus, dialogs, popovers | `surface-elevated` + `text` | restrained text/accent mix | focus ring | Overlay scrim is neutral and does not become a theme accent |
| Primary button | accent + text-on-accent | accent hover/active | focus ring | Disabled state is visibly disabled and still readable |
| Secondary button | elevated surface + text + border | surface change | focus ring | Must not look like a primary action |
| Inputs | bg or surface + text + border | border emphasis | focus ring and focus border | Placeholder uses readable muted text; invalid uses error plus message/icon |
| File tree/list rows | transparent/surface + text | list hover derived from surface | selection derived from accent | Current file, selected files, and active folder remain distinguishable |
| Preview | surface + text | links use link role | selection token | Rendered content may style documents, but surrounding chrome conforms |
| Terminal | bg/surface + text | n/a | focus ring on input | ANSI output colors are a separate terminal palette; shell chrome conforms |
| Notifications/chips | status surface + status foreground | optional emphasis | focus when actionable | Status meaning never derives from accent |
| Presenter/editor controls | normal app contract | normal interaction contract | normal focus contract | Slide content themes may differ; authoring and delivery chrome may not |

## Theme boundaries and exceptions

The following may use owned palettes, provided their surrounding controls still
conform:

- Monaco syntax highlighting and terminal ANSI output;
- document/presentation content authored by the user;
- data visualization series where distinct categorical colors are necessary;
- fixed third-party or brand artwork;
- image, video, PDF, and other source media.

Exceptions must not leak into navigation, buttons, labels, dialogs, or status
meaning. A chart legend control uses app tokens even when the chart series does
not.

## Hard-coded color policy

Literal colors are allowed only in:

- canonical token defaults and built-in theme definitions;
- explicitly owned syntax, ANSI, visualization, or media palettes;
- neutral translucency used for shadows and modal scrims;
- fixtures that are intentionally testing override behavior.

Literal colors are not allowed in new theme-aware component rules, inline
styles, or JavaScript-created UI. Fallback colors belong at the root token
definition, not repeated at each consumer.

Existing hard-coded component colors are migration debt. Do not add a new
high-specificity theme override to conceal them; replace the component value
with the correct semantic role.

## Theme editor behavior

The custom theme editor must use the same contract as built-in themes.

- Show semantic role names rather than a flat collection of color pickers.
- Preview canvas, panel, raised surface, primary/secondary buttons, text,
  links, focus, selection, and all four status types together.
- Calculate contrast live and identify the exact failing pair and ratio.
- Warn before saving an incomplete or non-conforming theme during migration;
  reject it once contract enforcement becomes required.
- Preserve the previous active theme until a preview passes or the user
  explicitly accepts temporary warnings.
- Version imported/exported custom themes and migrate compatibility aliases.

## Automated conformance

The completed system must provide four layers of verification:

1. **Contract validation** — every built-in theme has valid metadata, required
   tokens, parseable colors, and no unknown theme variables.
2. **Contrast validation** — all required foreground/background and interaction
   pairs pass the ratios in this brief after alpha compositing.
3. **Component gallery** — one deterministic page renders the conformance
   matrix for every theme and supports screenshot comparison.
4. **Real Electron smoke** — representative light, dark, and custom themes are
   applied to editor, file pane, preview, dialog, terminal, and presenter chrome
   with Axe and computed-style assertions.

The validator reports all failures in one run. CI should not require designers
to fix one theme or token at a time.

A temporary hard-coded-color allowlist may support migration. Every entry must
name the owning palette or workplan follow-up; the allowlist may not grow.

## Ownership and source order

The intended ownership is:

- `plugins/techne-theme-manager/techne-tokens.css`: canonical contract and
  defaults;
- `plugins/techne-theme-manager/themes.js`: built-in theme metadata and
  canonical overrides;
- `plugins/techne-theme-manager/theme-manager.js`: application and persistence;
- `css/techne-theme-adapter.css`: temporary one-way mapping from canonical
  tokens to legacy NightOwl aliases;
- component styles: consume canonical tokens without knowing theme IDs;
- `css/theme.css` and `css/techne-theme.css`: migration sources, not competing
  token authorities.

Styles load from defaults to theme overrides to component consumption. Selector
specificity and `!important` are not part of the theme API.

## Migration sequence

1. Add a versioned token contract, audit command, and all-theme component
   gallery without changing appearance.
2. Add the missing on-accent, focus, selection, link, and status-surface roles;
   retain compatibility aliases.
3. Repair built-in palettes against the contract, starting with text-on-accent,
   muted text, and hue-changing interaction states.
4. Migrate shared chrome and JavaScript-created UI from literals/legacy aliases
   to canonical roles, one component family at a time.
5. Make the theme editor run the same validator and version custom exports.
6. Remove obsolete direct overrides and retire competing theme-token ownership.
7. Promote conformance, gallery snapshots, Axe, and Electron theme smoke to
   required CI.

## Definition of done

The theme-system work is complete when:

- all built-in themes pass the versioned token and contrast contract;
- custom themes are validated against the same rules;
- the component gallery covers the matrix in this brief;
- editor, preview, files, dialogs, terminal, presentation chrome, and plugin UI
  show one coherent hierarchy in every built-in theme;
- status meaning, focus, selection, and disabled states are consistent and do
  not rely on color alone;
- theme-aware component code contains no unowned literal colors;
- legacy aliases flow only from the canonical adapter and no competing theme
  source remains;
- local and hosted CI run the same conformance checks.
