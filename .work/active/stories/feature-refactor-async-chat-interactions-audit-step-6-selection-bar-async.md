---
id: feature-refactor-async-chat-interactions-audit-step-6-selection-bar-async
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

# Step 6: Selection-bar capture — async notes / citations / flashcards

## Scope
Refactor the three selection-bar actions in `document-tab-body.tsx` (lines 254 / 271 / 286) to optimistic dispatch. Selection bar dismisses immediately on click; failure surfaces via the activity strip after threshold (two-tier failure pattern — no inline pip, since the bar is gone).

## Implementation
- Edit `packages/ui/src/components/document-tab-body.tsx`:
  - Three `useOptimisticAction` instances — one per action (note / cite / flashcard)
  - Each `trigger` captures the selection + payload
  - Bar dismisses immediately on trigger (existing behavior preserved)
  - No inline pip — the action's UI surface (the selection bar) is gone after dismiss
  - All dispatches run in background
- Mount `useActionEscalation` aggregating failures from all three hooks
- Tests:
  - Click note action → bar dismisses immediately
  - Failure unattended for threshold → activity strip entry appears
  - Retry from strip works (re-dispatches with original captured params)

## Acceptance Criteria
- [ ] All three selection actions refactored to use `useOptimisticAction`
- [ ] Selection bar dismisses immediately on any action click (UI never blocks)
- [ ] Success silently completes (no notification needed)
- [ ] Failure surfaces in status strip after threshold via `useActionEscalation`
- [ ] Strip retry replays original params
- [ ] Existing capture behaviors preserved on success path
- [ ] Tests cover dismiss-on-click + strip-on-failure

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 6
- File: `packages/ui/src/components/document-tab-body.tsx`
- Depends on step-1 (primitives + hook) and step-2 (escalation)
