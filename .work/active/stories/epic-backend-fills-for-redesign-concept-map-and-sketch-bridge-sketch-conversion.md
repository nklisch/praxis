---
id: epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-sketch-conversion
kind: story
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign-concept-map-and-sketch-bridge
depends_on: [epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Sketch → concept-map conversion + undo

## Scope

Units 3, 4, and the matching IPC + tests from the parent feature.

- `ConceptMapService.convertFromSketch(sketchId)`.
- Sketch editor button: "↗ convert to concept map".
- 24h undo window via snapshot-restore infrastructure.

Depends on
`epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore`
so the conversion is undoable.

See parent feature
`.work/active/features/epic-backend-fills-for-redesign-concept-map-and-sketch-bridge.md`.

## Implementation steps

1. Service:
   - Edit `packages/core/src/services/concept-map-service.ts`.
   - `convertFromSketch(sketchId): Promise<{ conceptMapId, originalSketchId }>`:
     - Read sketch JSON; extract labelled text shapes as nodes.
     - Extract arrows between shapes as edges; map known relation
       labels to canonical relation kinds; default to "related"
       otherwise.
     - Create a new concept-map artifact in the same scope
       (course / student) as the sketch.
     - Leave the original sketch in place.
   - Record the conversion as a configurator action so the
     snapshot-restore feature can undo it.

2. UI:
   - Add "↗ convert to concept map" button to the sketch editor
     (`note-editor-sketch` component or wherever the sketch toolbar
     lives).
   - On click: confirmation modal (`<Modal>`) listing the candidate
     node count + warning about labels needed.
   - On confirm: call service, open the new map in a new tab via
     the `session-tab-open-flow` pattern.

3. IPC + client:
   - `praxis.conceptMap.convertFromSketch` (envelope-wrapped).
   - Client method.

4. Tests:
   - Service-layer conversion with a seeded sketch (mock tldraw
     scene JSON).
   - UI button + modal flow tests.
   - Undo path: call convert → call restoreAction with the
     conversion's action id → assert the new map is deleted.
   - IPC harness tests.

5. Quality checks green.

## Acceptance criteria

- [ ] `convertFromSketch` produces a new map from labelled tldraw
      shapes; preserves the original sketch.
- [ ] Sketch editor surfaces the conversion button + confirmation.
- [ ] Undo via `restoreAction` deletes the converted map.
- [ ] All quality checks green.

## Out of scope

- Auto-relabelling unlabelled shapes via heuristics.
- Bidirectional sync (concept-map edits propagating back to the
  sketch).
- "Delete original sketch" affordance — separate concern.
