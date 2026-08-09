# Presentation authoring and delivery tools

NightOwl presentation mode includes an advisory preflight and an optional
presenter console. Both operate on the canonical presentation component and
the same viewport geometry used for delivery.

## Preflight

Open presentation mode and choose **Preflight**, or run **Presentation: Run
Preflight** from the Command Palette. The check never blocks rendering or
export. It reports every unsuppressed warning with its slide and source line.

The preflight checks:

- content that must be scaled to fit the fixed 16:9 slide;
- missing local Markdown images and `<!-- bg: ... -->` backgrounds;
- slides without Markdown headings;
- Markdown or HTML images without meaningful alternative text;
- rendered body text below 18 px; and
- rendered foreground/background contrast below WCAG thresholds.

Choose a warning to move the presentation canvas to its slide and place the
editor cursor at the corresponding source line. **Suppress** hides only that
exact deterministic warning for the current document. Suppressions are local
authoring preferences, do not change the Markdown, and can be restored from the
preflight panel. Content reloads automatically rerun an open preflight.

Local asset checks use the current document directory and the fixed file
capability. Network, data, and embedded assets are not treated as missing local
files. Contrast checks use the final rendered styles; text over photographic
backgrounds may still require human judgement.

## Presenter console

Start delivery and choose **Presenter**, or run **Presentation: Open Presenter
Console**. The console shows:

- the current slide title and text preview;
- the next slide title and preview;
- current speaker notes;
- elapsed delivery time; and
- previous/next controls.

The console is part of the main presentation surface rather than a separate
window. Its measured width becomes a right-hand stage inset, and the normal
contain-fit calculation reruns after it opens, closes, or resizes. The delivered
slide therefore remains entirely inside the remaining viewport. Console, timer,
navigation, and preflight state remain live across content refreshes and window
resizes during the presentation session.

## Source and verification

- `plugins/techne-presentations/presentation-preflight.js` owns deterministic
  analysis, source mapping, asset resolution, warning IDs, and suppression.
- `plugins/techne-presentations/src/MarkdownPreziApp.jsx` owns the preflight and
  presenter UI; `npm run presentation:build` regenerates the shipped runtime.
- `plugins/techne-presentations/preview-presentation.css` owns both panels and
  their responsive geometry.
- `tests/unit/renderer/plugins/presentation-preflight.test.js` covers the pure
  analysis contract.
- the required `@presentation-tools` Electron workflow verifies source
  navigation, suppression, content reload, timer/navigation state, resize fit,
  and non-overlap with the delivered slide.
