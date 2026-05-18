---
id: epic-ui-redesign-ground-up-workspace-concept-map-editor-restyle
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-three-state-and-ripples
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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

- [ ] Concept-map editor renders the locked canonical-hints panel
      layout.
- [ ] Three-state nodes + ripples panel from the sibling story
      surface correctly.
- [ ] All quality checks green.
