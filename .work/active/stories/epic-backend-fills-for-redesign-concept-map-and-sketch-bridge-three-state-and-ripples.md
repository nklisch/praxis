---
id: epic-backend-fills-for-redesign-concept-map-and-sketch-bridge-three-state-and-ripples
kind: story
stage: done
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

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `setNodeLink` sets `confidence: 0.0` for `best_guess` state — the original typeahead score is not preserved on the top-level field. The per-candidate `candidates[]` array retains confidence scores, so downstream logic can still read them. Acceptable.
- `computeRipples` fetches all student notes in JS rather than using SQL JSON path queries; acknowledged in impl notes as v1 / acceptable for small corpora.
- The `durationMinutes?: number | null` field on `Assignment` (in `artifacts.ts`) appears in this commit's diff but belongs to the `exam-timer` story. The field is correct and that story is already done — cosmetic cross-commit attribution quirk only.

**Notes**: 69 new tests across 4 files (service, UI overlay, ripples panel, IPC harness) all green. Pre-existing typecheck failures in `courses-section.tsx` / `note-editor-page.tsx` and the flaky `use-fragment-overrides` test are unrelated and pre-date this story. IPC channel naming matches client constant (`praxis.conceptMaps`). Backward-compatibility for maps without `linkState` (treated as `"unlinked"`) is correctly handled in both `computeRipples` and the overlay glyph renderer. Ghost edge hover UX is correctly guarded to `best_guess` nodes only.

## Implementation notes

- `linkState` and `candidates` added as optional fields on `ConceptLink` in
  `packages/core/src/types/artifacts.ts` — backward-compatible; maps without
  the field treat nodes as unlinked.
- `setNodeLink` / `computeRipples` added to `ConceptMapService` interface and
  `ConceptMapServiceImpl`. Ripple counts query `notes` (artifacts schema) and
  `sessions` (memory schema) entirely in-process; SQL JSON path queries not
  used (portability), concept-tag cross-check done in JS.
- `ConceptLinkOverlay` extended with a `glyphs` state array computed on each
  map/editor update. Glyph elements carry `aria-role="img"` with descriptive
  labels. Ghost edge rendered as an absolute-positioned SVG overlay; activated
  by `mouseEnter` on a `best_guess` glyph, removed on `mouseLeave`.
- New `<RipplesPanel>` component follows the `useResource` pattern — fires
  `computeRipples` whenever `elementId + candidateId` are both non-null, shows
  animated loading dot while in-flight, and resets to idle dashes when cleared.
- IPC channels added to `ipc-server.ts` using the `wrapEnvelope` / Zod
  validation pattern. Client methods added to `concept-map-client.ts` and the
  `ConceptMapClientApi` type.
- 69 new tests green across 4 files (service, UI overlay, ripples panel, IPC
  harness). Pre-existing lint failures in `.mockups/` and one flaky
  `use-fragment-overrides` test are unrelated and untouched.
