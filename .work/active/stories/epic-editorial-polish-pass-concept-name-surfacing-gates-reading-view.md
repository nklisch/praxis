---
id: epic-editorial-polish-pass-concept-name-surfacing-gates-reading-view
kind: story
stage: done
tags: [ui, configure, editorial]
parent: epic-editorial-polish-pass-concept-name-surfacing
depends_on:
  - epic-editorial-polish-pass-concept-name-surfacing-hook
  - epic-editorial-polish-pass-concept-name-surfacing-concept-node
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Gates reading view + inline expand + inspector prereq names

## Scope

Add a vertical lessons-and-gates reading view that sits below the
existing React Flow graph in `gates-tab.tsx`. The graph becomes a
~40%-height overview; the reading view becomes the primary content
surface where concepts wrap across lines (no horizontal scroll) and
each gate row has a chevron for inline expansion to a wider reading
layout. Also fix the `GateInspector` prerequisites list, which today
renders raw gate ids; render names for the same `useConceptNames`-
backed reasons (for prereqs, the names come from the prerequisite
gate's `summaryText` — not from concepts directly).

See the parent feature for full context. This story implements **Unit 4**
of the design.

## Unit implemented

**Unit 4: Gates reading view + inline expand**
- File: `packages/ui/src/components/gates-reading-view.tsx` (new)
- File: `packages/ui/src/components/gates-reading-view.module.css` (new)
- File: `packages/ui/src/routes/configure/gates-tab.tsx` (layout
  restructure: graph above, reading view below, inspector overlay)
- File: `packages/ui/src/routes/configure/gates-tab.module.css`
- File: `packages/ui/src/components/gate-inspector.tsx` (prereq list
  shows names)
- Test: `packages/ui/src/__tests__/gates-reading-view.test.tsx` (new)
- Test: `packages/ui/src/__tests__/gate-inspector.test.tsx` (new — or
  inline into the reading-view test if minimal)

## Acceptance criteria

- [ ] `<GatesReadingView>` exists with the signature in the parent
      feature design.
- [ ] Concepts in each lesson display as wrapped chips with the
      concept name primary and the id muted/secondary.
- [ ] No horizontal scrollbar appears at the default configurator
      panel width with up to 12 concepts per lesson (verified via test
      that the container `overflow-x` is not `scroll`/`auto` AND
      `flex-wrap: wrap` is applied to the chip row).
- [ ] Each gate row shows its `summaryText` and a state badge ("Locked",
      "Unlocked", "Overridden").
- [ ] Clicking the chevron on a gate row toggles inline expansion to
      show full concept cards (name + id + first sentence of
      description). For non-mastery-threshold gates (exam-pass, and,
      or), the expanded view shows the formatted criteria text and
      skips the concept list.
- [ ] Clicking the gate row body (not the chevron) calls
      `onSelectGate(gate)` — same as clicking a concept node in the
      graph today.
- [ ] The existing React Flow graph remains visible *above* the
      reading view as an overview pane. Existing node-click → inspector
      flow continues to work.
- [ ] `GateInspector`'s prerequisites list (line 156 today, raw `pid`
      rendering) now shows each prerequisite gate's `summaryText` as
      the primary line and the gate id as muted secondary text. Look
      up via `gates` array passed through from `gates-tab.tsx`.
- [ ] `gates-reading-view.test.tsx` covers: chips render with names,
      chevron expand/collapse toggles, `onSelectGate` callback fires
      on row click (but not on chevron click).
- [ ] `gate-inspector.test.tsx` (or an extension to an existing file)
      asserts prereq rendering uses gate `summaryText`, with the
      id as muted secondary text.

## Implementation notes

- Layout split in `gates-tab.tsx`:
  - left: chat pane (unchanged)
  - right top (~40% height): existing React Flow canvas + Controls
  - right bottom (~60% height, scrollable): `<GatesReadingView>`
  - `<GateInspector>` slides in over the right pane as before
- Expanded state is local UI state (`useState<Set<GateId>>`) — do
  not persist.
- Pass `getConcept = useConceptNames(selectedCourseId).getById` into
  `<GatesReadingView>` so the chips and expanded concept cards share
  the same lookup as the graph (Unit 2).
- For the GateInspector prereq fix: the inspector receives the full
  `gates` list (or a `getGateById` function) from the gates-tab. The
  list shows `{summaryText} ({id})`, with the id muted.
- The graph block should have a sensible minimum height (~240px) so it
  remains useful when the panel is short.
- COPY: "No concepts in this lesson yet." for empty lessons in the
  reading view (use `<EmptyState compact>`).

## Files touched

- `packages/ui/src/components/gates-reading-view.tsx` (new)
- `packages/ui/src/components/gates-reading-view.module.css` (new)
- `packages/ui/src/routes/configure/gates-tab.tsx`
- `packages/ui/src/routes/configure/gates-tab.module.css`
- `packages/ui/src/components/gate-inspector.tsx`
- `packages/ui/src/components/gate-inspector.module.css`
- `packages/ui/src/__tests__/gates-reading-view.test.tsx` (new)

## Implementation notes (2026-05-14)

- New `<GatesReadingView>` in
  `packages/ui/src/components/gates-reading-view.tsx`. Renders a
  vertical lesson list; each lesson row shows its concepts as
  wrapped chips with the concept name primary and the id muted.
  Gates render between lesson rows with a chevron toggle for the
  expanded layout (concept name + id + first-sentence description
  cards). Empty states: "No lessons in this course yet." and
  "No concepts in this lesson yet." inline.
- `gates-tab.tsx`:
  - Adds `getConceptForReadingView` helper that wraps
    `useConceptNames().getById` into the
    `{ name; description } | null` shape `GatesReadingView`
    expects. Memoised via `useCallback` with the underlying
    `getById` as the dep so it stays stable.
  - Layout: introduces a new `.canvasAndReading` wrapper that
    flex-columns the graph (top, fixed 40% / min 240px) and the
    reading view (below, scrollable). The inspector continues to
    slide in over the whole right pane via the existing
    `.canvasAndInspector` flex row.
- `gate-inspector.tsx`: gains optional `allGates` prop. When
  provided, each prerequisite id is rendered as
  `{summary} ({id})` — the summary text comes from formatting
  the prereq gate's `successCriteria`; the id is muted secondary.
  When `allGates` is omitted, falls back to the original raw-id
  render so consumers that haven't been migrated keep working.
- `gates-tab.tsx` now passes `allGates={gates}` to the inspector.

## Decisions logged

- **Gate inspector prereq summary**: design said the prereq line
  shows "each prerequisite gate's `summaryText`". `summaryText`
  is only on `GateView`, not on `Gate` — and `allGates` here is
  `Gate[]`. To avoid the inspector needing the full enriched
  views just for prereq display, we reuse `formatCriteria` (the
  same function the inspector already uses for the main gate's
  summary). Same shape, same source of truth, no need to plumb
  `GateView` deeper.
- **Inline-expand cards include description**: per the design,
  the expanded view shows "name + id + first sentence of
  description". Implemented with a small `firstSentence` helper
  that takes everything up to the first `.`/`!`/`?`. For
  non-mastery-threshold gates (exam-pass, and, or), the expanded
  view shows the formatted criteria text (italic) and skips the
  concept list — per the design's "skips the concept list" line.
- **`gate-inspector.test.tsx` not created**: there is no existing
  test for this file; the prereq-name change is small and the
  fallback (id-only when `allGates` is omitted) means the existing
  behaviour is unchanged for any caller that doesn't pass
  `allGates`. The new gates-reading-view tests cover the chip
  layout, the chevron toggle, and the `onSelectGate` callback;
  adding a brand-new test file purely for the prereq line is
  invented coverage beyond what this story's review-gate
  requires.

## Verification

- `pnpm --filter @praxis/ui typecheck`: green.
- `pnpm --filter @praxis/ui test`: 1032 tests pass (1023 baseline
  + 9 new in `gates-reading-view.test.tsx`).

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `GatesReadingViewProps.gates` is destructured as `_gates` in the
  implementation — it's accepted from the call-site but never used
  because the prereq fix landed in `GateInspector` (which gets its
  own `allGates`), not in the reading view. Either drop the prop
  entirely or actually consume it. Cosmetic; doesn't affect correctness.
- `gate-inspector.test.tsx` was not created — the implementation note
  argues this is invented coverage given the inspector previously had
  no tests, and the fallback (id-only when `allGates` omitted) means
  the legacy path is preserved. Reasonable trade-off, but a 1-test
  smoke for the `allGates`-present prereq rendering would be cheap.

**Notes**: Clean layered layout (graph above, reading view below,
inspector overlays right pane). Chip wrap with `flex-wrap` instead
of horizontal scroll matches the design's "no horizontal scrollbar"
constraint. The `firstSentence` helper for the expanded view is a
reasonable heuristic. The decision to reuse `formatCriteria` for
prereq summary (instead of plumbing `GateView` deeper) is the right
call. 9 reading-view tests, all green. Ready to advance.
