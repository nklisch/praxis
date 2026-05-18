---
id: epic-ui-redesign-ground-up-workspace-note-editor-sketch
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-sketch-conversion
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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

- [ ] Sketch editor matches locked mock.
- [ ] Conversion bridge calls the service and navigates to the new
      concept map.
- [ ] All quality checks green.
