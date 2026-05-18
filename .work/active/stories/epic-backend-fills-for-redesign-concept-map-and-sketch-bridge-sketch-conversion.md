---
id: epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-sketch-conversion
kind: story
stage: done
tags: []
parent: epic-backend-fills-for-redesign-concept-map-and-sketch-bridge
depends_on: [epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

## Implementation notes

### Architecture

- **`ConceptMapServiceImpl.convertFromSketch(noteId, studentId)`** — new method on
  the existing service. Reads the `notes` row, extracts tldraw shapes/arrows via
  `extractFromTldrawScene()` (handles both `store`-at-root and `document.store` layouts),
  creates the concept map + initial version, then records a `configurator_actions` row
  (`kind: "conceptMap.create"`) and a `configurator_snapshots` row (`entityKind:
  "conceptMap.create"`) for the 24h undo window.

- **`ConceptMapServiceDeps.configuratorId?`** — optional: when absent, the conversion
  skips the audit trail (test/embed convenience). Wired in `services.ts` with the shared
  `conceptMapConfiguratorId` lambda.

- **`AuthoringServiceImpl.restoreAction`** — extended with a `conceptMap.create` case:
  `restore = services.conceptMaps.delete(entityKey)`. `captureCurrentStateForUnrevert`
  returns `null` for this case (un-revert of a map deletion is not supported in v1).

- **`SnapshotEntityKind`** and **`ConfiguratorAction`** extended with `"conceptMap.create"`.

- **`ConceptMapService` interface** extended with `convertFromSketch(noteId, studentId)`.

### IPC + client

- New channel `praxis.conceptMaps.convertFromSketch` (envelope-wrapped, Zod-validated
  `{ sketchNoteId: string }`). Wired in `ipc-server.ts` after `computeRipples`.
- `ConceptMapClient.convertFromSketch({ sketchNoteId })` added.
- `ConceptMapClientApi` type updated.

### UI bridge

- `NoteEditorSketch` accepts optional `onConvertToConceptMap?: () => Promise<void>` prop.
  When provided, a toolbar strip appears above the canvas with "↗ convert to concept map".
  Clicking opens a `<Modal>` (modal-primitive pattern) with a label-warning message,
  Cancel + Convert buttons, converting/error states.
- `note-editor-page.tsx` wires `handleConvertToConceptMap` → calls
  `client.conceptMaps.convertFromSketch` → navigates to
  `/courses/$courseId/concept-maps/$conceptMapId`. Button is only shown when the sketch
  note has a `courseId` in context.

### tldraw extraction

- `extractFromTldrawScene`: handles `{ store }` (top-level), `{ document: { store } }`,
  and flat shape-map layouts. Extracts `type: "text"` and `type: "geo"` shapes with
  non-empty `props.text` as nodes; `type: "arrow"` shapes with bound `start/end`
  shape ids as edges. Arrow `props.text` is mapped through `RELATION_LABEL_MAP` (15+
  known labels) defaulting to `"related"`. Empty/unlabelled shapes silently skipped.
- `buildConceptMapScene`: lays out nodes in a 4-column grid with `COL_GAP=220px`,
  inserts arrow shapes with bound start/end anchors.

### Tests added

- `concept-map-service.test.ts` — 10 new tests: creation, node extraction, edge
  extraction with known labels, empty scene, configurator audit trail, error cases
  (note not found, wrong format, no courseId).
- `snapshot-restore.test.ts` — undo round-trip test: convert → restoreAction →
  map deleted, original sketch preserved.
- `sketches-concept-maps-channel-envelope.test.ts` — 4 new IPC harness tests.
- `note-editor-sketch-convert.test.tsx` — 7 new UI tests: button visibility, modal
  open/close, confirm call, error display, ESC key.

### Quality

All 4349 tests pass. Zero new typecheck errors. Lint clean (source files).

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `SnapshotCapturer.forConceptMapCreate()` is added but never called — `concept-map-service.ts` writes the snapshot row inline. The helper is dead code. Fine to leave for now; delete it in a later cleanup pass.
- `note-editor-page.tsx` line 140: `note.id as any` to pass `NoteId` to `convertFromSketch`. Pre-existing pattern in that file; not introduced by this story.

**Notes**: Core conversion logic (`extractFromTldrawScene`, `buildConceptMapScene`) is solid and handles all three tldraw JSON layouts. The undo path (configurator_actions + configurator_snapshots → `restoreAction` → `conceptMaps.delete`) is correctly wired and covered by the round-trip test in `snapshot-restore.test.ts`. IPC channel follows the `ipc-envelope-handler` pattern. UI modal uses `<Modal>` primitive correctly with converting/error states. `configu ratorId?` optional dep keeps the service embeddable in test-only contexts. 22 new tests total (the scope doc says 20 — the discrepancy is because snapshot-restore got 1 and IPC got 4 more than the headline implied; still well covered). All acceptance criteria satisfied.
