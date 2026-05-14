---
id: epic-editorial-polish-pass-concept-name-surfacing-concept-node
kind: story
stage: implementing
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
- `packages/ui/src/__tests__/concept-node.test.tsx`
