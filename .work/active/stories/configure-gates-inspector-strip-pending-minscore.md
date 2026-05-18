---
id: configure-gates-inspector-strip-pending-minscore
kind: story
stage: implementing
tags: [ui, bug]
parent: null
depends_on: []
release_binding: null
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
