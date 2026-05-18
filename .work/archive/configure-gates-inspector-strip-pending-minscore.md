---
id: configure-gates-inspector-strip-pending-minscore
kind: story
stage: done
tags: [ui, bug]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Fix GateInspectorStrip: pendingMinScore never reflects user-edited value

## Problem

`gates-tab.tsx` sets `pendingMinScore` in `SelectedGateState` to
`selectedGate.successCriteria.minScore` — the **saved** value — when a gate
enters the `dirtyGateIds` set. This means `hasPendingChange` in
`GateInspectorStrip` is always `false` (since `pendingMinScore === savedMinScore`),
so the inspector strip's "changed field" highlight (`inspectorFieldChanged` class,
strikethrough old value) never activates.

The warning-coloured dirty edge works correctly (driven by `dirtyGateIds`). Only
the inspector strip before/after display is broken.

## Root cause

`onThresholdEdit` in `gate-inspector.tsx` receives only `gateId` — not the new
value. `gates-tab.tsx` marks the gate dirty but has no way to record *what* value
the user typed.

## Fix

Extend `onThresholdEdit` to pass the new value:

```typescript
// gate-inspector.tsx
onThresholdEdit?: (gateId: GateId, newMinScore: number) => void;
// ...
onChange={(e) => {
  setMinScore(e.target.value);
  const parsed = Number(e.target.value) / 100;
  if (!Number.isNaN(parsed)) onThresholdEdit?.(gate.id, parsed);
}}
```

Then in `gates-tab.tsx`, store the local-edited value (e.g. a
`Map<GateId, number>` or alongside `dirtyGateIds`) and pass it as `pendingMinScore`
when building `SelectedGateState`.

Add a test: edit the threshold field → verify inspector strip shows
`inspectorFieldChanged` class and a strikethrough "was X%" line.

## Files

- `packages/ui/src/components/gate-inspector.tsx`
- `packages/ui/src/routes/configure/gates-tab.tsx`
- `packages/ui/src/routes/configure.tsx` (GateInspectorStrip)
- `packages/ui/src/__tests__/configure-gates-tab.test.tsx`

## Implementation notes

Three-part fix:

1. **`gate-inspector.tsx`** — `onThresholdEdit` signature extended from `(gateId: GateId) => void` to `(gateId: GateId, newMinScore: number) => void`. The `onChange` handler now computes `Number(e.target.value) / 100` and passes it as the second argument.

2. **`gates-tab.tsx`** — Added `pendingScores: ReadonlyMap<GateId, number>` state alongside the existing `dirtyGateIds` set. `handleGateThresholdEdit` now accepts and stores `newMinScore` in that map. The `useEffect` that writes `SelectedGateState` to context now reads `pendingScores.get(selectedGate.id) ?? null` instead of always returning the saved `minScore`. `pendingScores` is cleared symmetrically with `dirtyGateIds` on save, delete, and course change.

3. **`configure-gates-tab.test.tsx`** — New `describe("GatesTab — inspector strip pendingMinScore")` test: opens the inspector via GatesReadingView, edits the threshold input to 85, asserts `setSelectedGate` is called with `pendingMinScore: 0.85` (not the saved 0.7). All 15 tests pass.

No changes to `configure.tsx` were needed — `GateInspectorStrip` was already correct; the bug was entirely in how `pendingMinScore` was populated upstream.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- The `onChange` guard `if (!Number.isNaN(parsed))` silently swallows empty-string or non-numeric input without calling `onThresholdEdit`. This is defensively correct — the inspector strip just won't update mid-keystroke if the field is cleared — but it means typing "8" then "85" only fires for valid intermediate values. Acceptable for the UI goal.

**Notes**: Three-part fix is clean and minimal. `pendingScores` is symmetrically cleared on save, delete, and course change. The regression test correctly distinguishes the edited value (0.85) from the saved value (0.7) and asserts via `setSelectedGate`. No foundation-doc drift. No security surface. Advancing to done.
