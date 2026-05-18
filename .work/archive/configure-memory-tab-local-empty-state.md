---
id: configure-memory-tab-local-empty-state
kind: story
stage: done
tags: [ui, patterns]
parent: null
depends_on: []
release_binding: v0.1.3
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

## Implementation notes

- Removed the local `EmptyState({ primary, hint })` function from `memory-tab.tsx` (was at line 699).
- Added import for `EmptyState` from `../../components/empty-state.js` and `COPY` from `../../lib/copy.js`.
- Added 5 new keys under `COPY.empty` in `copy.ts`: `memorySemanticEmpty`, `memoryMisconceptionsEmpty`, `memoryProceduralEmpty`, `memoryAffectiveEmpty`, `memoryEpisodicEmpty`. Each combines the former `primary` + `hint` strings into a single sentence.
- All 5 call sites now use `<EmptyState message={COPY.empty.memoryXxxEmpty} compact />` — `compact` mode is appropriate since these render inside constrained pane sections, not full-screen routes.
- All 18 existing memory-tab tests pass. Lint shows no errors in changed files (pre-existing errors in mockup HTML files and unrelated source files are unchanged).

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: The orphaned CSS classes `.emptyState`, `.emptyPrimary`, `.emptyHint` remain in `memory-tab.module.css`. They are dead code but harmless; a future CSS cleanup pass can remove them.

**Notes**: The local `EmptyState` function is fully removed from `memory-tab.tsx`. All 5 call sites use the shared `<EmptyState>` editorial primitive with `compact` mode and dedicated `COPY.empty.*` keys. Copy strings correctly fold the old `primary` + `hint` sentences into natural single-sentence messages. All 1591 UI tests pass. Patterns compliance confirmed (`editorial-ui-primitives`).
