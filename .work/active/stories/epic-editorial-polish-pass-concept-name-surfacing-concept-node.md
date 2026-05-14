---
id: epic-editorial-polish-pass-concept-name-surfacing-concept-node
kind: story
stage: review
tags: [ui, configure, editorial]
parent: epic-editorial-polish-pass-concept-name-surfacing
depends_on: [epic-editorial-polish-pass-concept-name-surfacing-hook]
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# ConceptNode swap — name primary, id secondary

## Scope

Wire concept names through `ConceptNode` and the graph in
`gates-tab.tsx`. Extend `ConceptNodeData` with a `conceptId` field for
muted secondary display + `title=` tooltip. Replace the data-assembly
bug at `gates-tab.tsx:215` (`data.name = conceptId`) with the real
concept name resolved via `useConceptNames`.

See the parent feature for full context. This story implements **Unit 2**
of the design.

## Unit implemented

**Unit 2: ConceptNode name + secondary id surfacing**
- File: `packages/ui/src/components/concept-node.tsx` (extend)
- File: `packages/ui/src/components/concept-node.module.css` (extend)
- File: `packages/ui/src/routes/configure/gates-tab.tsx` (data wiring
  + call `useConceptNames`)
- Test: `packages/ui/src/__tests__/concept-node.test.tsx` (extend)

## Acceptance criteria

- [ ] `ConceptNodeData` includes a required `conceptId: string` field.
- [ ] `ConceptNodeDisplay` renders the name visually prominent and the
      id muted (`--color-text-muted`, ~0.6rem, mono font if available).
- [ ] The secondary id span has `title={data.conceptId}` so hovering
      reveals the full id even if CSS truncates it.
- [ ] `gates-tab.tsx` calls `useConceptNames(selectedCourseId)` at the
      top of `GatesTab` and passes `getName` into `buildGraph`.
- [ ] `buildGraph` populates `data.name = getName(conceptId)` and
      `data.conceptId = conceptId`.
- [ ] When the concept lookup is still loading or unknown, the node
      shows the id (fallback) — the graph is never blank.
- [ ] All existing tone tests (mastered, in-progress, not-started,
      locked) still pass.
- [ ] New test cases assert the secondary id renders and the title
      attribute carries the full id.

## Implementation notes

- The `useMemo` for `{ nodes, edges }` adds `getName` to its dep array.
  Since `useConceptNames` memoizes `getName` against the concepts array
  identity, this re-runs only when concepts (or lessons/gates) change —
  which is the right trigger for a re-layout.
- Do not change the `min-width` / `max-width` of the node card unless
  the secondary id forces wrapping at the existing 110-160px range. If
  it does, raise `max-width` slightly (180px), but prefer to truncate
  the id with `text-overflow: ellipsis` over making the node bigger.

## Files touched

- `packages/ui/src/components/concept-node.tsx`
- `packages/ui/src/components/concept-node.module.css`
- `packages/ui/src/routes/configure/gates-tab.tsx`
- `packages/ui/src/routes/course-map.tsx` (also populates `conceptId`
  — the same node component is used by the course map; the
  required field was missing there too)
- `packages/ui/src/__tests__/concept-node.test.tsx`

## Implementation notes (2026-05-14)

- Added required `conceptId: string` field to `ConceptNodeData`.
- `ConceptNodeDisplay` renders a `<span className={styles.conceptId}
  title={data.conceptId}>` below the name; the `title` exposes the
  full id when CSS truncates the secondary line.
- New `.conceptId` CSS rule: 0.6rem, mono font, muted color, single-line
  with ellipsis. No change to the node card width — the design called
  for letting the id truncate before resizing.
- `gates-tab.tsx`:
  - Calls `useConceptNames(selectedCourseId ?? undefined)` at the top
    of `GatesTab`.
  - `buildGraph(lessons, gates, getName)` signature gains the third
    parameter; the `useMemo` deps include `getName`.
  - Inside the loop: `name: getName(conceptId)` (drops the id-as-name
    fallback) and `conceptId: conceptId` (new required field).
- `course-map.tsx`: same `conceptId` field added (the course map
  builds its own graph with its own conceptsById lookup; `getName`
  isn't needed here since names already come from `conceptRow.name`,
  but the new required field had to be populated).
- Test file: existing `renderNode` helper now defaults `conceptId` so
  the existing tone tests don't have to specify it. Three new tests
  in a "conceptId secondary line" describe block assert:
  - the id renders below the name
  - the `title` attribute carries the full id
  - the id-as-fallback case (when `name === conceptId`)

## Verification

- `pnpm --filter @praxis/ui typecheck`: green.
- `pnpm --filter @praxis/ui exec vitest run src/__tests__/concept-node.test.tsx`:
  16 tests pass (13 existing + 3 new).
