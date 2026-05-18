---
id: configure-memory-tab-local-empty-state
kind: story
stage: implementing
tags: [ui, patterns]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Replace local EmptyState in memory-tab.tsx with shared editorial primitive

## Problem

`memory-tab.tsx` defines a local `EmptyState({ primary, hint })` function (line 699)
used in five places inside the file. The project has a shared
`<EmptyState>` component at `packages/ui/src/components/empty-state.tsx` that
implements the editorial design language. The `editorial-ui-primitives` pattern
says explicitly: "Show an empty list → use `<EmptyState message={COPY.empty.xxx}>`"
and "never re-implement."

## Fix

1. Remove the local `EmptyState` function from `memory-tab.tsx`.
2. Import `EmptyState` from `../../components/empty-state.js`.
3. Add `COPY.empty.*` entries for the five empty states (or reuse closest existing
   entries where appropriate).
4. Pass `compact` prop where used inside constrained pane sections.

## Files

- `packages/ui/src/routes/configure/memory-tab.tsx`
- `packages/ui/src/lib/copy.ts` (add empty state copy keys)
