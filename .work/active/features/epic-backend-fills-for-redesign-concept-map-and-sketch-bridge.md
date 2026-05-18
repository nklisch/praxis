---
id: epic-backend-fills-for-redesign-concept-map-and-sketch-bridge
kind: feature
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Concept-map UX completion + Sketch ↔ concept-map conversion

## Brief

Two tightly-related additions to the concept-map editor surface:

**Concept-map best-guess UX.** The locked editor mock distinguishes
three node states: **linked ✓** (canonical link confirmed),
**best-guess ?** (Praxis's tentative link awaiting confirmation), and
**unlinked** (default). Canonical-link matching infrastructure exists
(`ConceptLinkOverlay`, `CanonicalHintsOverlay`); what's missing is the
three-state model, the per-candidate confidence display, the
**hover-to-preview ghost edges** (show how a candidate link would
connect to the canonical graph before committing), and the
**ripples panel** (compute downstream effects of a link confirmation
— concept count delta, notes re-tagged, tutor references — and
display them).

**Sketch ↔ concept-map conversion.** The locked sketch editor shows
a `↗ convert to concept map` bridge. This feature adds a conversion
service: extract candidate nodes from labelled tldraw text shapes,
create a new concept-map artifact, preserve the original sketch
alongside (default keep-both), and support a 24h undo window.

What this feature does **not** cover: the editor UI shells (already
in workspace feature implementation); tldraw integration (already
shipped); the canonical knowledge graph (already shipped).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **independent** — no within-epic deps.
- UI co-ships with: `epic-ui-redesign-ground-up-workspace`
  implementation (consumes both the new states and the conversion).

## Foundation references

- `docs/ARCHITECTURE.md` § "Artifact lifecycle" → concept maps
  paragraph mentions `ConceptMapDrawing` artifacts and canonical
  linking
- `packages/core/src/services/concept-map-service.ts` — extends with
  the three-state + ripples + conversion APIs
- `packages/ui/src/components/concept-link-overlay.tsx` and
  `canonical-hints-overlay.tsx` — existing overlay primitives the
  new UX extends
- `.mockups/screens/.../-workspace/concept-map-editor.html` and
  `.mockups/flows/concept-map-link/` — locked editor + the 4-step
  link-confirmation flow
- `.mockups/flows/sketch-to-concept-map/` — the conversion flow

## Design decisions

- **Three-state node model lives in the node JSON, not a new column.**
  Concept-map nodes already carry per-node JSON; adding
  `linkState: "linked" | "best_guess" | "unlinked"` keeps the
  read/write path single-row. Tooltips/confidence numbers live in the
  same blob.
- **Ghost-edge preview is pure UI** — no persistence. The editor
  computes the would-be edges on hover; nothing lands until the user
  confirms.
- **Ripples are computed on demand.** Each link confirmation can run a
  ripple query (concept-count delta, notes re-tagged, tutor refs).
  Cheap enough for on-demand; caching would invalidate too often.
- **Sketch → concept-map conversion is one-shot with a 24h undo
  window.** Original sketch persists by default; "delete sketch" is a
  separate explicit action. The undo window uses the
  snapshot-restore infrastructure from sibling feature
  `snapshot-restore` — concept-map create is recorded; restore undoes
  the conversion.
- **Sub-capabilities ship as two stories** (link UX + conversion)
  because they touch different services and have distinct tests, but
  they're independent and can run in parallel.

## Architectural choice

Two parallel sub-features:

**A — Three-state UX + ripples.**
- Extend `concept_map_nodes` JSON to carry `linkState` + per-candidate
  `confidence`.
- Extend `ConceptMapService` with `setNodeLink(nodeId, candidateId, state)`.
- New `computeRipples(nodeId, candidateId)` returning
  `{ conceptCountDelta, notesRetagged, tutorRefsAffected }`.
- UI: extend `ConceptLinkOverlay` to render the three states + ghost
  edges on hover; new `RipplesPanel` consuming the new service method.

**B — Sketch → concept-map conversion.**
- New method `ConceptMapService.convertFromSketch(sketchId)`:
  - Reads the sketch's tldraw scene JSON; extracts labelled text
    shapes as candidate nodes.
  - Creates a new concept-map artifact in the same scope (course /
    student) as the sketch.
  - Preserves the original sketch by default.
  - Returns `{ conceptMapId, originalSketchId }`.
- UI: "↗ convert to concept map" button on the sketch editor; on
  confirmation, calls the service and opens the new concept map in a
  new tab.
- Undo: leverages `snapshot-restore` (the conversion records an
  action; restoring deletes the new concept map).

## Implementation Units

### Unit 1: Three-state model + service (Story A)

- Extend node JSON type in `packages/core/src/types/concept-map.ts`:
  `linkState: "linked" | "best_guess" | "unlinked"`,
  `candidates?: Array<{ canonicalConceptId, confidence }>`.
- `ConceptMapService.setNodeLink(nodeId, candidateId | null, state)`.
- `ConceptMapService.computeRipples(nodeId, candidateId): Promise<RippleSummary>`
  - `conceptCountDelta`: how many canonical concepts this map will
    cover after linking.
  - `notesRetagged`: count of notes whose canonical link tag changes
    when this link confirms.
  - `tutorRefsAffected`: tutor-session references that now resolve
    differently.

### Unit 2: Editor UI extensions (Story A)

- `ConceptLinkOverlay`: render `linkState` as ✓ / ? / ○ glyphs;
  hover on a `best_guess` node shows ghost edges to the candidate's
  canonical neighbors.
- New `<RipplesPanel>` component that subscribes to the selected
  candidate and surfaces `computeRipples` results.

### Unit 3: Sketch → concept-map service (Story B)

- New method `ConceptMapService.convertFromSketch(sketchId)`.
- Extraction logic: tldraw scene → `nodes` from labelled text shapes,
  `edges` from arrows between shapes. Confidence-bucketed edges where
  the arrow's label maps to a known relation.
- Conversion records an action via the snapshot-restore feature so
  the 24h undo window works.

### Unit 4: Sketch editor button + new-tab opening (Story B)

- Add "↗ convert to concept map" button to the sketch editor.
- On click: confirm dialog → call service → open new tab via
  `session-tab-open-flow` pattern (the new map gets its own tab).

### Unit 5: IPC + client + tests

- IPC channels and client surfaces follow existing patterns.
- Tests per unit; integration test for end-to-end conversion.

## Implementation Order

Two parallel stories:

1. `epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-three-state-and-ripples` —
   Units 1 + 2 + IPC/tests.
2. `epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-sketch-conversion` —
   Units 3 + 4 + IPC/tests. Depends on
   `snapshot-restore-capture-and-restore` for the undo window.

## Acceptance Criteria

Aggregate:
- [ ] Concept-map nodes carry three-state link info; UI renders the
      glyphs; ghost edges appear on hover.
- [ ] Ripples panel surfaces correct deltas for a known fixture.
- [ ] Sketch → concept-map conversion creates a new map, preserves
      the original sketch, and is undoable within 24h.
- [ ] All quality checks green.

## Risks

- **Ripple computation cost.** For large notes/sessions corpora the
  `notesRetagged` count may need indexing. v1 accepts the cost;
  story body notes a follow-up.
- **Sketch label extraction is fuzzy.** Unlabelled shapes are
  skipped; the conversion may produce a sparse map for sketches
  without explicit text. Document the limitation; the editor can
  re-run extraction after the user labels more shapes.
