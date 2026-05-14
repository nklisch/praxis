---
id: epic-editorial-polish-pass-concept-name-surfacing-gates-reading-view
kind: story
stage: implementing
tags: [ui, configure, editorial]
parent: epic-editorial-polish-pass-concept-name-surfacing
depends_on:
  - epic-editorial-polish-pass-concept-name-surfacing-hook
  - epic-editorial-polish-pass-concept-name-surfacing-concept-node
release_binding: null
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
- `packages/ui/src/__tests__/gates-reading-view.test.tsx` (new)
- `packages/ui/src/__tests__/gate-inspector.test.tsx` (new, minimal)
