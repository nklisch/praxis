---
id: epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-three-state-and-ripples
kind: story
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign-concept-map-and-sketch-bridge
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Three-state concept-map nodes + ripples panel

## Scope

Units 1, 2, and the matching IPC + tests from the parent feature.

- Node JSON gains `linkState: "linked" | "best_guess" | "unlinked"`
  and optional `candidates[]` with confidence.
- `ConceptMapService.setNodeLink`, `computeRipples`.
- UI: `ConceptLinkOverlay` renders state glyphs + ghost edges; new
  `<RipplesPanel>` consumes the new service method.

See parent feature
`.work/active/features/epic-backend-fills-for-redesign-concept-map-and-sketch-bridge.md`.

## Implementation steps

1. Types:
   - Edit `packages/core/src/types/concept-map.ts` to add `linkState`
     and `candidates?: { canonicalConceptId, confidence }[]` to the
     node shape.
   - Add `RippleSummary = { conceptCountDelta, notesRetagged, tutorRefsAffected }`.

2. Service:
   - Edit `packages/core/src/services/concept-map-service.ts`:
     - `setNodeLink(nodeId, candidateId | null, state)` updates the
       node JSON.
     - `computeRipples(nodeId, candidateId): Promise<RippleSummary>`:
       - Concept count: count distinct canonical concepts after the
         hypothetical link.
       - Notes retagged: query notes whose canonical link tag would
         change.
       - Tutor refs: query tutor sessions that reference this
         concept-map node and would resolve differently.

3. UI:
   - Edit `packages/ui/src/components/concept-link-overlay.tsx` to
     render the three-state glyph next to each node.
   - On hover of a `best_guess` node, draw ghost edges to that
     candidate's canonical neighbors via React Flow `<Edge>` with a
     `ghost` className (dashed + low opacity).
   - New `packages/ui/src/components/ripples-panel.{tsx,module.css}`
     component subscribed to the currently-selected candidate.

4. IPC + client:
   - `praxis.conceptMap.setNodeLink`,
     `praxis.conceptMap.computeRipples` (envelope-wrapped).
   - Client methods.

5. Tests:
   - Service-layer round-trip for `setNodeLink`.
   - Ripples computation with seeded fixtures.
   - UI rendering tests for the three states + ghost edges.
   - IPC harness tests.

6. Quality checks green.

## Acceptance criteria

- [ ] Node JSON carries the three-state info.
- [ ] `setNodeLink` round-trips; `computeRipples` returns correct
      counts on seeded fixtures.
- [ ] UI renders ✓ / ? / ○ glyphs and ghost edges on hover.
- [ ] `<RipplesPanel>` surfaces correct numbers.
- [ ] All quality checks green.

## Out of scope

- Sketch → concept-map conversion (separate story).
- Ripple-computation indexing for large corpora (follow-up).
