---
id: epic-ui-redesign-ground-up-workspace-note-editor-sketch
kind: story
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-sketch-conversion
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Sketch note editor — free canvas + `↗ convert to concept map` bridge

## Scope

Rewrite the sketch note editor per
`.mockups/screens/.../-workspace/note-sketch-editor.html`:
- Free drawing canvas (tldraw).
- Tools rail (pen / shape / arrow / text / color swatches).
- Inline notice at top + `↗ convert to concept map` bridge.

## Implementation steps

1. New `packages/ui/src/components/note-editor-sketch.{tsx,module.css}`
   (refactor existing).
2. Mount tldraw with locked color palette.
3. Inline notice strip explaining sketch vs concept map.
4. "↗ convert to concept map" button wired to
   `praxisClient.conceptMap.convertFromSketch` (from sibling story).
5. Tests cover the bridge interaction.
6. Quality checks green.

## Acceptance criteria

- [x] Sketch editor matches locked mock.
- [x] Conversion bridge calls the service and navigates to the new
      concept map.
- [x] All quality checks green.

## Implementation notes

Refactored `note-editor-sketch.{tsx,module.css}` to match the locked mock:

- **Layout**: changed from flex-column to `grid-template-columns: 56px 1fr` — tools rail left,
  canvas area right.
- **Tools rail** (`<nav aria-label="Drawing tools">`): Select / Pen / Highlight / Text / Arrow /
  Shape / `<hr>` sep / Eraser / `<hr>` sep / 5 color swatches. Active tool tracked via
  `aria-pressed`; display-only state (tldraw manages actual tool activation internally).
- **Color swatches**: map to design tokens (`--color-text-primary`, `--color-accent`,
  `--tint-bootstrap`, `--tint-teach`, `--tint-quiz`). `<button>` with `border-radius: 50%` and
  `border-color: var(--color-accent)` for active state.
- **Inline notice strip**: absolute-positioned at `top: 12px; left: 50%; transform: translateX(-50%)`
  inside `.canvasArea`. `pointer-events: none` on the strip; re-enabled on the convert link inside.
  The `↗ convert to concept map` link (from the sibling story) moved from a separate `.toolbar` row
  into the notice strip as an italic accent inline link — matches mock `.convert-link` pattern.
- **`<hr>` for separators**: replaced `<div role="separator">` (Biome a11y error) with `<hr>` +
  CSS `border: 0` reset.
- **Token alignment**: all hardcoded fallback colors (`#4a6fa5`, `#222`, `#666`, `#c0392b`)
  replaced with canonical tokens (`--color-accent`, `--color-text-primary`, `--color-text-secondary`,
  `--color-danger`).
- **Tests** (`src/__tests__/note-editor-sketch.test.tsx`, 14 tests): canvas mounts; each tool
  button renders; `aria-pressed` state toggles; all 5 swatches present; notice strip visible;
  convert button conditional; modal opens on click.
- Updated `src/components/__tests__/note-editor-sketch-convert.test.tsx` (7 tests): selector
  updated from `/convert to concept map/i` to `/convert to a concept map/i` to match the new
  notice-strip button text.
- Full test suite: 415 files / 4423 tests green.
