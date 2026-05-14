---
id: epic-editorial-polish-pass-concept-name-surfacing-hook
kind: story
stage: review
tags: [ui, configure, editorial]
parent: epic-editorial-polish-pass-concept-name-surfacing
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# useConceptNames hook — course-scoped batched concept lookup

## Scope

Land a small hook that wraps `client.artifacts.concepts(courseId)` and
exposes an O(1) `getName(id) => string` lookup plus the full row via
`getById(id) => ConceptLookup | null`. Foundation for the ConceptNode
wiring (Unit 2) and the optional reading-view lookup (Unit 4).

See the parent feature for full context. This story implements **Unit 1**
of the design.

## Unit implemented

**Unit 1: useConceptNames hook**
- File: `packages/ui/src/hooks/use-concept-names.ts` (new)
- Pattern: `use-resource-hook` (from `.claude/rules/patterns.md`)
- Test: `packages/ui/src/hooks/__tests__/use-concept-names.test.ts` (new)

## Acceptance criteria

- [ ] Returns `concepts` array reflecting `client.artifacts.concepts(courseId)`.
- [ ] `getName(knownId)` returns the concept's name.
- [ ] `getName(unknownId)` returns `unknownId` (fallback for stale /
      still-loading ids — keeps the UI debuggable, never blank).
- [ ] `getById(knownId)` returns the full `ConceptLookup` row.
- [ ] `getById(unknownId)` returns `null`.
- [ ] Changing `courseId` triggers a refetch.
- [ ] `undefined` courseId resolves to empty state without firing IPC.
- [ ] `getName` and `getById` references are stable across renders when
      the underlying concepts array hasn't changed (memoize against the
      array identity).
- [ ] Unit tests cover all of the above using `makeFakeClient` and
      `@testing-library/react`'s `renderHook`.

## Implementation notes

- Wrap `useResource(() => client.artifacts.concepts(courseId))`.
- Build a `Map<string, ConceptLookup>` inside a `useMemo` keyed on the
  concepts array identity.
- The exported `ConceptLookup` shape is intentionally narrower than the
  raw `ConceptRow` (drops `graphId`, `standardsTags`) — keep the hook's
  surface minimal; callers that need more should use
  `client.artifacts.concepts` directly.
- `getName` fallback (`id` itself) preserves the current behavior when
  lookups fail; this is intentional, do not throw or return a placeholder.

## Files touched

- `packages/ui/src/hooks/use-concept-names.ts` (new)
- `packages/ui/src/hooks/__tests__/use-concept-names.test.ts` (new)
