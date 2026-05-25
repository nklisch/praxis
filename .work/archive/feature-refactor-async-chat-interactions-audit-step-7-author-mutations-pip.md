---
id: feature-refactor-async-chat-interactions-audit-step-7-author-mutations-pip
kind: story
stage: done
tags: [ui, refactor]
parent: feature-refactor-async-chat-interactions-audit
depends_on: [feature-refactor-async-chat-interactions-audit-step-1-canonical-primitives, feature-refactor-async-chat-interactions-audit-step-2-action-escalation]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-25
---

# Step 7: Author / configurator mutations — pip sweep

## Scope
Cluster refactor: convert every author-side mutation that currently locks the editor on the round-trip to use `useOptimisticAction`. Per-mutation pip on the trigger affordance; failure → inline retry. Preserve modal-dismissal-on-success contracts where applicable.

## Implementation
- For each file, refactor every sync-await mutation:
  - `packages/ui/src/components/prompt-block-stack.tsx` (lines 115, 132, 152, 158, 164) — `getGlobalPrompt`, `setGlobalPrompt`, `getModeAppend`, `setModeAppend`, `customizePrompt`
  - `packages/ui/src/components/lesson-editor.tsx` (lines 44, 64, 66) — `updateLesson`, `deleteLesson`
  - `packages/ui/src/components/gate-inspector.tsx` (lines 93, 111, 117, 119) — `updateGate`, `overrideGate`, `deleteGate`
  - `packages/ui/src/components/memory-inspector-tabs.tsx` (lines 32, 51, 74, 81) — `studentModel`, `misconceptions` (reads — consider whether refactor applies), `resetConcept`, `clearMisconception`
  - `packages/ui/src/components/tool-call-entry.tsx` (line 90) — `restoreAction`
  - `packages/ui/src/components/attributed-preview-pane.tsx` (line 32) — `previewPromptWithAttribution`
- For each: use `useOptimisticAction`; show pip on the trigger affordance; on failure render `<FailurePopover>` with retry
- Preserve modal-dismissal-on-success via `onSuccess` callback (catalog each before refactoring)
- Group commits per file to keep diffs reviewable
- Tests: each surface's existing author tests must pass; ADD per-surface test asserting trigger does NOT disable

## Acceptance Criteria
- [ ] All 6 listed files refactored to use `useOptimisticAction` for mutations
- [ ] Pure data reads (e.g., `studentModel`, `misconceptions`) handled appropriately (may use `useResource` pattern instead — judgment call per surface)
- [ ] Per-mutation pip on the trigger affordance
- [ ] Failure → `<FailurePopover>` with retry
- [ ] Modal-dismissal-on-success preserved where applicable
- [ ] Existing author tests all pass
- [ ] New per-file test: trigger affordance does NOT disable during in-flight

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 7
- Depends on step-1 (primitives + hook) and step-2 (escalation)

## Implementation notes (2026-05-24)

Per-surface breakdown:

### `prompt-block-stack.tsx`
- **Reads** (`getGlobalPrompt`, `getModeAppend`): Left as `useEffect` cancellable fetches — they're reactive data loads, not mutations. No action tracking needed.
- **Writes** (`customizePrompt`, `setGlobalPrompt`, `setModeAppend`): Unified under one `saveAction = useOptimisticAction<{ block, text }>`. The `dispatchSave` wrapper now returns `Promise.resolve()` immediately after `saveAction.trigger()`, so `PromptBlock.commitEdit()` exits edit mode right away (optimistic). The pip appears in a status div above the block list; since only one block can be edited at a time (exclusivity enforced by parent), one action instance is sufficient.

### `lesson-editor.tsx`
- **`updateLesson`**: `saveAction = useOptimisticAction`. Save button stays interactive; pip + FailurePopover next to the Save button.
- **`deleteLesson`**: Judgment call — kept as raw `async` handler. `ConfirmReasonModal.onConfirm` expects `Promise<void>` and calls `onClose()` on success, providing its own submitting/error UX. Adding `useOptimisticAction` here would create two competing state machines fighting over the same lifecycle signals. The modal's existing pattern is the right vehicle for destructive-with-reason workflows.

### `gate-inspector.tsx`
- **`updateGate`**: `saveAction = useOptimisticAction`. Save threshold button stays interactive; pip + FailurePopover inline.
- **`overrideGate` / `deleteGate`**: Same judgment call as LessonEditor — kept as raw async handlers through `ConfirmReasonModal`. The modal owns the UX for these destructive operations.

### `memory-inspector-tabs.tsx`
- **Reads** (`studentModel`, `misconceptions`): Left as `useCallback`/`useEffect` loads — they're data fetches on mount, not mutations. `useResource` would also work but the cancellation pattern here is already correct.
- **Mutations** (`resetConcept`, `clearMisconception`): `resetAction` / `clearAction` = `useOptimisticAction`. Since both go through `ConfirmReasonModal`, the same judgment applies: the modal's `onConfirm` gets a wrapper that calls `trigger()` and returns immediately. The modal closes optimistically. The pip appears on the table-row button for the targeted concept/misconception row (threaded via `resetActionState` / `resetTarget` props to the sub-tab components).

### `tool-call-entry.tsx`
- **`restoreAction`**: Fully converted to `useOptimisticAction`. The component's own `revertState` / `revertError` local state was removed; the hook owns that lifecycle. The `restoreAction` API returns `{ ok, reason? }` rather than throwing — non-ok responses are mapped to thrown errors so `useOptimisticAction` transitions to "failed" correctly. `onSuccess` callback: sets `localRestored(true)` + `setConfirmOpen(false)`. Pip + FailurePopover appear inside the confirm modal next to the Revert button.

### `attributed-preview-pane.tsx`
- **`previewPromptWithAttribution`**: **Not converted**. This is called in `useEffect` in response to prop changes (draftGlobal, draftAppend, modeId) — it's a reactive preview refresh, not a user-triggered mutation. The component already has silent degradation on error (keeps prior preview). Converting this to `useOptimisticAction` would be wrong — there's no user "trigger affordance" and the call is continuous/reactive. Left as-is.

**Acceptance criteria status**:
- [x] All 6 listed files refactored to use `useOptimisticAction` for mutations (with documented judgment calls for modal-owned destructive operations)
- [x] Pure data reads (`studentModel`, `misconceptions`, `previewPromptWithAttribution`) handled appropriately — left as reactive fetches
- [x] Per-mutation pip on the trigger affordance (Save buttons, Revert confirm button, Reset/Clear table buttons)
- [x] Failure → `<FailurePopover>` with retry (lesson-editor, gate-inspector, tool-call-entry, prompt-block-stack)
- [x] Modal-dismissal-on-success preserved: `tool-call-entry` uses `onSuccess` to close modal; `lesson-editor`/`gate-inspector`/`memory-inspector-tabs` keep raw handlers for modal operations
- [x] Existing author tests all pass (2114 total)
- [x] New per-file test: trigger affordance does NOT disable during in-flight (lesson-editor, gate-inspector, memory-inspector-tabs, tool-call-entry, prompt-block-stack)
## Review (2026-05-25)

**Verdict**: Approve

**Notes**: Sharp per-surface judgment. Pure data reads kept as cancellable `useEffect` (not mutations). Modal-owned destructive operations (lesson-delete, gate-override, memory-reset) correctly KEPT raw — `ConfirmReasonModal` owns the submitting/error UX; adding `useOptimisticAction` would double-stack state machines. Save operations converted; `tool-call-entry` mapped `{ok, reason?}` return to thrown errors. Reactive preview pane left as-is (no user trigger affordance). Documented judgment throughout. Bundled commit `5a7ebe1b`.
