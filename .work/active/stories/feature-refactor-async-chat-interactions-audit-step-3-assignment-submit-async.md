---
id: feature-refactor-async-chat-interactions-audit-step-3-assignment-submit-async
kind: story
stage: implementing
tags: [ui, refactor]
parent: feature-refactor-async-chat-interactions-audit
depends_on: [feature-refactor-async-chat-interactions-audit-step-1-canonical-primitives, feature-refactor-async-chat-interactions-audit-step-2-action-escalation]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Assignment submit refactor — async sketch + recordResponse across 3 surfaces

## Scope
Refactor the three assignment-submit surfaces (assignment-card, quiz-tab-body, homework-tab-body — and exam if structurally identical) to use `useOptimisticAction` for the sketch-upload + recordResponse chain. Submit button never disables; pip shows in-flight state; failure → inline `<FailurePopover>` → retry replays the same captured params.

## Implementation
- For each of:
  - `packages/ui/src/components/assignment-card.tsx` (lines 71, 81)
  - `packages/ui/src/components/quiz-tab-body.tsx` (lines 127, 135)
  - `packages/ui/src/components/homework-tab-body.tsx` (lines 167, 175)
  - `packages/ui/src/components/exam-tab-body.tsx` (if it follows the same pattern — verify)
- Replace the sync `handleSubmit` with a `useOptimisticAction` hook whose `dispatch` chains the two IPC calls in the background.
- Render `<ActionPip state={action.state} />` next to the submit button.
- On failure, render `<FailurePopover>` anchored to the submit button with retry/dismiss.
- Mount `useActionEscalation({ failedActions: [...] })` per surface so unattended failures escalate to the activity strip.
- Preserve existing post-submit navigation/state-advance via `onSuccess` callback.
- Update existing assignment-submit tests; ADD a test asserting the submit button does NOT disable on click during in-flight.

## Acceptance Criteria
- [ ] All three (or four) files refactored to use `useOptimisticAction`
- [ ] Submit button never disables; pip shows in-flight state
- [ ] Sketch + recordResponse run in background — no UI blocking
- [ ] Existing functionality preserved (post-submit advance behavior etc.)
- [ ] Failure → `<FailurePopover>` → retry replays the same dispatch params
- [ ] Failure unattended for threshold → `useActionEscalation` registers to activity strip
- [ ] All existing assignment-submit tests pass
- [ ] New test asserts submit button stays interactive during in-flight

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 3
- Depends on step-1 (primitives + hook) and step-2 (escalation)
