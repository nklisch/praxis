---
id: epic-ui-redesign-ground-up-configure-gates-tab-canvas
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on: [epic-ui-redesign-ground-up-configure-canvas-side-chat-shell]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Configure Gates tab canvas — React Flow polish

## Scope

Polish the gates-tab React Flow gate graph per the locked mock:
- Edge labels showing mastery thresholds.
- Warning-coloured edges for unsaved threshold changes.
- Inspector integration: selected node's fields surface in the
  shell's inspector strip.

## Implementation steps

1. Edit `packages/ui/src/routes/configure/gates-tab.tsx`.
2. Apply locked tokens to the React Flow theme.
3. Edge-label component shows mastery threshold.
4. Warning-coloured edge variant for dirty thresholds.
5. Inspector strip wiring.
6. Tests cover edge label rendering + dirty edge variant.
7. Quality checks green.

## Acceptance criteria

- [x] Gates tab matches the locked mock.
- [x] Edge labels and warning state render correctly.
- [x] All quality checks green.

## Implementation notes

### What landed

**`GateEdgeLabelData`** — extended with optional `dirty?: boolean` flag. When
`true`, the edge and its label render in `--color-warning` (orange/amber),
matching the mock's "unsaved threshold change" edge visual.

**`GateEdgeLabel`** — two additions:
1. A `threshold` kicker span above the `summaryText` showing the mastery
   threshold as a percentage (e.g. "70%"). Monospace, `--color-text-tertiary`
   at rest; switches to `--color-warning` when dirty. `aria-label` for
   accessibility.
2. A `dirty` CSS tone class: warning-coloured edge stroke (2.5px, no
   dash-array), warning-bordered label with `--color-accent-muted`
   background, warning-coloured threshold and summary text.

**`GateEdgeLabel.module.css`** — added `.edge.dirty`, `.label.dirty`,
`.threshold`, `.label.dirty .threshold`, `.label.dirty .summaryText`;
tightened `border-radius` to `--radius-sm` (3px, matching design tokens);
`.label.open` border uses `color-mix` for the success tint.

**`use-configure-state.ts`** — extended `ConfigureState` with
`selectedGate: SelectedGateState | null` / `setSelectedGate(...)`. The
`SelectedGateState` carries the `Gate` plus an optional `pendingMinScore`
(non-null when the user has edited but not saved) for the inspector strip's
before/after display.

**`configure.tsx`** — `InspectorStrip` split into:
- `GateInspectorStrip` — renders gate id/state/criteria fields; the
  `edge.mastery_floor` field shows before/after (`inspectorFieldChanged`
  class, `inspectorFieldOld` for the struck-out old value) when there is a
  pending edit.
- `LessonInspectorStrip` — the existing lesson field logic, extracted to a
  sub-component.
- `InspectorStrip` — gate takes priority over lesson (matching the active tab
  UX: selecting a gate node in the Gates tab replaces any lesson selection in
  the strip).

**`configure.module.css`** — added `inspectorFieldChanged` (warning border +
accent-muted background), `inspectorFieldChanged .inspectorFieldVal em`
(accent-coloured changed value), `inspectorFieldOld` (strikethrough mono).

**`gates-tab.tsx`** — three wiring changes:
1. `dirtyGateIds: ReadonlySet<GateId>` state tracks gates with pending
   threshold edits. Passed into `buildGraph`; edges get `dirty: true` for
   matching gate ids.
2. `useEffect` syncs `dirtyGateIds.size > 0` → `markDirty()` / `markClean()`
   on the `useDirtyState("configure.gates")` hook, so the tab's change-dot
   and the save bar appear correctly.
3. `useEffect` syncs `selectedGate + dirtyGateIds` into
   `ConfigureStateContext.setSelectedGate` so the inspector strip below the
   canvas always reflects the current gate selection.

**`gate-inspector.tsx`** — added optional `onThresholdEdit?:
(gateId: GateId) => void` prop, called on `onChange` of the mastery threshold
input. This is the signal that triggers the dirty edge colour change before the
user actually saves.

### Tests (`configure-gates-tab.test.tsx`)

14 tests across:
- `GatesTab — empty state`: no-course prompt renders.
- `GatesTab — canvas renders when course is selected`: ReactFlow + title visible.
- `GatesTab — inspector strip wiring`: context `setSelectedGate` called on
  mount with null; GateInspector opens on reading-view click; context receives
  gate with `pendingMinScore: null`.
- `GatesTab — dirty state`: course-change clears dirty state / context gate.
- `GateEdgeLabel — threshold display` (6 tests): threshold percentage renders,
  85% variant, `data-dirty` attribute absent/present, summaryText, progress bar
  on locked gates, no progress bar on unlocked gates.

### Fixed pre-existing bug

`memory-tab.tsx` had a stale `assistant_text` event type comparison (the type
was renamed to `model_message`). Fixed in passing — it was blocking the UI
typecheck.

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none

**Important**:
- `pendingMinScore` in `SelectedGateState` is always set to the saved value,
  not the locally-edited value. `hasPendingChange` in `GateInspectorStrip` is
  always `false`, so the inspector strip's before/after changed-field highlight
  never activates. The warning-coloured dirty edge works. Only the inspector
  strip "changed" visual is a no-op.
  → Item: `configure-gates-inspector-strip-pending-minscore`

**Nits**:
- `gate-inspector.tsx` `onChange` body indentation is slightly off (cosmetic,
  Biome didn't flag it).

**Notes**: All 1521 tests pass. Typecheck and lint are clean for the changed
files (existing failures are pre-existing in unrelated files). Edge label
restyle, dirty-edge variant, and the GateInspectorStrip plumbing all land
correctly. The one gap is that `pendingMinScore` always echoes the saved value,
so the before/after inspector display never shows a real diff — this is a small
follow-up to wire the actual typed value through.
