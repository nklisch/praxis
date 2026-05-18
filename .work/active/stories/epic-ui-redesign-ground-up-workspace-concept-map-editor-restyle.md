---
id: epic-ui-redesign-ground-up-workspace-concept-map-editor-restyle
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-three-state-and-ripples
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Concept-map editor — canonical-hints panel layout

## Scope

Refactor `concept-map-editor.tsx` to match
`.mockups/screens/.../-workspace/concept-map-editor.html`:
- Canvas in the middle with three-state nodes.
- Left rail of drawing tools.
- Right panel: candidate cards + canonical definition + ripples.

The three-state UX + ripples logic lives in the sibling backend
story; this story is the layout + visual restyle.

## Implementation steps

1. Edit `packages/ui/src/routes/concept-map-editor.tsx`.
2. Restyle `ConceptLinkOverlay` and `CanonicalHintsOverlay` per
   locked mock.
3. Apply locked tokens.
4. Tests cover layout + integration with the new overlays.
5. Quality checks green.

## Acceptance criteria

- [x] Concept-map editor renders the locked canonical-hints panel
      layout.
- [x] Three-state nodes + ripples panel from the sibling story
      surface correctly.
- [x] All quality checks green.

## Implementation notes

### Layout

Complete restyle of `packages/ui/src/routes/concept-map-editor.tsx` to
the locked three-column layout (`56px | 1fr | 320px`):

- **Left tools rail** (`styles.toolsRail`): seven drawing tools
  (select / node / edge / text / pen / box / erase) grouped into three
  visual bands separated by top-border dividers. Each button calls
  `editor.setCurrentTool(toolId)` and highlights the active tool with
  `--color-accent-muted` background. A `writing-mode: vertical-rl` meta
  label at the bottom shows the active tool id.

- **Canvas** (`styles.canvas`): tldraw fills absolutely, `ConceptLinkOverlay`
  layered on top for typeahead + three-state glyph markers (✓ / ?). A
  canvas legend in the top-left shows linked/best-guess/unlinked counts
  with colour-coded dots backed by `--color-success`, `--color-warning`,
  `--color-text-tertiary`.

- **Right hints panel** (`aside.hintsPanel`): replaces the old toggle-gated
  `CanonicalHintsOverlay` floating over the canvas. Permanently visible.
  Sections:
  1. Selected node info card (driven by tldraw selection listener).
  2. Canonical match candidates list — scored via `matchConceptByLabel`,
     top-5, click to choose; confirms link via ✓ button.
  3. `<RipplesPanel>` — feeds `elementId` + `candidateId` (chosen or top
     match) to `client.conceptMaps.computeRipples`.
  4. "Make this concept your own" input escape hatch.
  5. Undrawn canonical concepts list — replaces `CanonicalHintsOverlay`;
     "+ add to map" creates a tldraw text shape and fires `handleAddToMap`.

### CSS

`concept-map-editor.module.css` rewritten: editorial tokens
(`--font-serif`, `--font-display`, `--font-mono`, `--color-bg-*`,
`--color-border`, `--color-accent`, `--radius-sm/md`) throughout.
Old `.toolbar` / `.toolbarBtn` / `.canvasContainer` classes removed.

### Selected-node tracking

`editor.store.listen` now also calls `editor.getSelectedShapeIds()` after
each store change. When exactly one shape is selected, it extracts the
label via `shapeUtil.getText` and stores `{ shapeId, label }` in
`selectedNode` state, which drives candidate matching and `RipplesPanel`.

### Tests

`concept-map-editor-route.test.tsx` updated:
- Replaced "Show canonical hints" toggle tests (removed feature) with
  three new tests: 3-column layout `data-testid` presence, Rename + Select
  tool buttons, `RipplesPanel` `data-testid` presence.
- Added `computeRipples` mock to `makeClient` so `RipplesPanel` doesn't
  error on mount.
- Total: 12 tests, all passing.

### Pre-existing failures (not introduced here)

- `@praxis/desktop` typecheck: `authoring-chat-pane.tsx` + `notes-list.tsx`
  (`exactOptionalPropertyTypes` mismatches) — pre-existing.
- `tool-call-entry.test.tsx`: duplicate text element — pre-existing
  untracked file failing before this story landed.

## Review (2026-05-18)

**Verdict**: Approve with comments (bug fixed inline)

**Blockers**: none (1 blocker fixed inline — see notes)
**Important**: none
**Nits**: `undrawnConcepts` slice is hardcoded to `slice(0, 8)` — fine for now but worth a "show all" affordance when the count grows.

**Notes**: One correctness bug found and fixed inline:
- `TOOL_GROUPS` line 77 had `id: "eraser"` for the "Free text" entry — clicking that button activated the eraser tool. Fixed to `id: "text"`. Both "Concept node" and "Free text" now call `setCurrentTool("text")`; the UI distinction is labeling only, matching tldraw's single text-tool reality.

Layout matches brief: three-column `56px | 1fr | 320px`, left tools rail with 7 tools in three groups, canvas with `ConceptLinkOverlay` + legend, right hints panel permanently visible. `RipplesPanel` correctly wired with `elementId` + `activeCandidateId`. Selected-node tracking via `editor.store.listen` + `getSelectedShapeIds()` is correct and debounced-safe. Candidate matching memoized via `useMemo`. 12 tests cover layout, rename flow, version count, `RipplesPanel` mount.
