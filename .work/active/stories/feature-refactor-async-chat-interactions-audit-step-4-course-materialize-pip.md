---
id: feature-refactor-async-chat-interactions-audit-step-4-course-materialize-pip
kind: story
stage: review
tags: [ui, refactor]
parent: feature-refactor-async-chat-interactions-audit
depends_on: [feature-refactor-async-chat-interactions-audit-step-1-canonical-primitives, feature-refactor-async-chat-interactions-audit-step-2-action-escalation]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Course-materialize confirmation pip

## Scope
Refactor the course-create-tab-body confirm button to use `useOptimisticAction` with external-settle. Pip stays pending from click until the draft-events stream emits `finalized`; success transition opens the teach session in a new tab (existing behavior).

## Implementation
- Edit `packages/ui/src/components/course-create-tab-body.tsx` (lines 135, 215-227):
  - Hook the confirm button with `useOptimisticAction` whose `dispatch` triggers the existing `prefillMessage` → `useStreamedSend` flow
  - Use `externalSettle("success" | "failed", reason?)` from the existing `useEffect` that watches draft-events: when finalized arrives → `externalSettle("success")` → existing `openSessionInTab` callback fires from `onSuccess`
  - Use `<ActionPip>` next to the confirm button; replace the `setConfirming(true)` text-change with the pip
- Mount `useActionEscalation` so unattended failures escalate
- Tests:
  - Simulate finalized event → pip transitions to success → session opens in tab (mock useTabs)
  - Simulate failure → pip → retry replays the same prefillMessage
  - Confirm button never disables

## Acceptance Criteria
- [ ] Confirm button uses `useOptimisticAction` with `externalSettle` wiring
- [ ] Pending pip shows from click until `finalized` event arrives via draft-events stream
- [ ] Success → opens session in tab (existing behavior preserved)
- [ ] Failure → inline `<FailurePopover>` with retry
- [ ] Button doesn't disable during in-flight
- [ ] Tests cover happy path + failure path + retry

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 4
- File: `packages/ui/src/components/course-create-tab-body.tsx`
- Depends on step-1 (primitives + hook) and step-2 (escalation)

## Implementation notes (2026-05-24)

Refactored the course-create confirm button to use `useOptimisticAction` with the `externalSettle` pattern.

**Key design decisions:**
- The course-materialize flow has no clean awaitable Promise — completion arrives asynchronously via the draft-events `finalized` streaming event. The `dispatch` function sets `confirming: true` and returns `await new Promise<void>(() => {})` (intentionally never-resolving). The draft-events `finalized` handler calls `confirmAction.externalSettle("success")` to settle the hook externally.
- `handleConfirmAndOpen` guards against double-trigger if the action is already pending or retrying.
- `setConfirming(false)` is called in `onError` so the `AuthoringChatPane` prefill-message path can react correctly.
- The confirm button text stays "Confirm and open ↗" throughout — the `ActionPip` conveys in-flight state instead of button text changes.
- `useActionEscalation` mounted with `activity: null` (graceful degradation).

**Files changed:**
- `packages/ui/src/components/course-create-tab-body.tsx`
