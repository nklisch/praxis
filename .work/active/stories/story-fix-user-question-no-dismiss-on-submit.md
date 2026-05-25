---
id: story-fix-user-question-no-dismiss-on-submit
kind: story
stage: review
tags: [bug, ui]
parent: feature-question-panel-rework
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Fix: structured-question / quick-check card stays greyed-out through the round-trip instead of dismissing on submit

## Symptom
When the user submits an in-chat structured user-question (the inline quick-check / dialog prompt the tutor poses), the card stays on screen in a greyed-out disabled state for the entire duration that the tutor is thinking. Compounds with the panel-occlusion problem (sibling story `story-questions-tabbed-display`) — while the panel sits greyed-out post-submit, it continues to occlude the chat below, so the user can't see any of the progress the tutor is producing in the gap between submit and the next visible response.

## Expected behavior
Clicking submit transitions the card immediately to its resolved state (chosen answer visible, `answered` marker in place of submit button) so the chat thread below becomes legible right away. The tutor's next message follows asynchronously and narrates the response. Per `docs/UX.md` (rolled forward as part of `epic-chat-interaction-ux-overhaul`): "On submit the card transitions immediately to its resolved form — no greyed-out wait through the tutor's thinking round-trip."

## Fix approach (preliminary — finalize during /agile-workflow:fix)
Decouple the dismiss transition from the response-arrival event. Currently the card almost certainly listens for the next assistant message (or a tool-result envelope) before unlocking; that read-after-write coupling is the bug. The component should transition to resolved state in the submit handler itself, with the tutor's response arriving as a separate, subsequent event in the chat thread.

## Entry point
`/agile-workflow:fix` — this is a verified bug with clear symptom and clear desired behavior. Single-stride story.

## Source idea
`idea-user-question-no-dismiss-on-submit` (parked 2026-05-24).

## Implementation notes (2026-05-24)

**What was built:**

- `StructuredQuestionCard` (`packages/ui/src/components/structured-question-card.tsx`): refactored submit handler to be fire-and-forget. On submit, local state transitions immediately to `dismissed=true` + `dismissedVariant="answered"`, rendering a `<ThreadChip>` summary in place of the full card. The `onResolve` IPC call fires as a void promise in the background — no await, no greyed-out wait.

- `QuickCheckCard` (`packages/ui/src/components/quick-check-card.tsx`): same pattern. On submit, `dismissedVariant` is set to `"answered"` and `dismissedAt` is captured; the component renders `<ThreadChip>` immediately. Clicking the chip sets `expandedFromChip=true` which renders the old collapsedSummary + collapsedDetails read-only card view (with correct/incorrect badge). "Clarify in chat" sets `dismissedVariant="dismissed"`.

- `ThreadChip` (NEW — `packages/ui/src/components/thread-chip.tsx` + `thread-chip.module.css`): one-line bubble that replaces a resolved or dismissed question card. Answered variant: brick-accent left border, "you answered" / "you selected N" verb, quoted answer text, timestamp. Dismissed variant: neutral left border, no answer text, no expand. Click-to-expand fires `onExpand` callback (answered only).

**Test updates:**

- `structured-question-card.test.tsx`: updated post-submit tests to assert the new ThreadChip behaviour (card → chip → click-to-expand → read-only card). The old "shows 'Submitted' and disables button" tests correctly replaced per the test-integrity convention.

- `quick-check-card.test.tsx`: updated 4 tests to match the new ThreadChip → expand → read-only card flow. Badge tests now expand the chip first.

- NEW: `packages/ui/src/__tests__/thread-chip.test.tsx` — 11 tests covering both variants, time formatting, expand callback, and dismissed non-interactivity.
