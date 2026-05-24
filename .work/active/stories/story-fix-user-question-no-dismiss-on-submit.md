---
id: story-fix-user-question-no-dismiss-on-submit
kind: story
stage: implementing
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
