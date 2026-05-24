---
id: story-ask-student-question-surface-rendering
kind: story
stage: done
tags: [ui, bug, tutor-ux, tools]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-20
updated: 2026-05-23
---

# Ask-student-question surface rendering

## Brief

When the tutor calls the `ask_student_question` tool inside course-create /
course-design mode, nothing appears in the UI for the student to respond
to. `docs/SPEC.md` documents `ask_student_question` as a human-in-the-loop
tool scoped to course-create and configure modes (a structured-choice
prompt the agent uses to clarify intent during course authoring without
yielding the turn). The tool dispatch holds the `tool_result` Promise open
until the renderer signals back — but today the renderer never gets a
surface to signal from in course-create, so the call hangs.

The fix likely lives in the shared question-surface plumbing rather than
mode-specific code: probably either the subscriber wiring (the renderer
isn't listening for the dispatch event), the rendering selector (the
mode's tab body doesn't include the question surface), or the response
round-trip (the renderer signals but the dispatch doesn't resolve).

## Repro and fix path

1. Open a course-create session and trigger a tutor turn that calls
   `ask_student_question`. Confirm the tool dispatch fires but no UI
   appears.
2. Trace the dispatch → subscriber → render → response cycle (`QuickCheck`
   uses an analogous mechanism per the `human-in-the-loop tool dispatch`
   section of SPEC.md — confirm `ask_student_question` follows the same
   shape).
3. Identify the missing wire: mode-tool-scoping gap, missing renderer in
   the course-create tab body, or response-handler not awaiting the right
   call id.
4. Audit configure mode too — same tool is scoped there. Confirm whichever
   surface exists works in both modes after the fix.
5. Add a UI test covering the dispatch → render → respond round-trip.

## Implementation notes

**Root cause:** `CourseCreateTabBody` delegates all chat rendering to
`AuthoringChatPane`, which is also used by configure mode. Neither component
mounted `useQuickCheckBridge` or rendered `StructuredQuestionCard`, so
pending `ask_student_question` events were dropped — the tool call hung
forever waiting for a response that never came.

**Fix:** Added `useQuickCheckBridge(sessionId ?? undefined)` and
`StructuredQuestionCard` rendering to `AuthoringChatPane`
(`packages/ui/src/components/authoring-chat-pane.tsx`). Placing the bridge
in `AuthoringChatPane` (the shared component) means both course-create and
configure modes pick it up in one change with no double-mounting risk —
`CourseCreateTabBody` passes its session id down to `AuthoringChatPane`,
which is the single place that owns the pane's event subscription.

The cards are rendered after the messages list, before the error banner,
matching the placement pattern in `TeachChatTabBody`. Only
`structured-question` items are filtered through (the only kind the
`ask_student_question` tool produces); unrecognized kinds render `null`.

**Test added:**
`packages/ui/src/__tests__/authoring-chat-pane-quick-check.test.tsx`
— 4 tests covering:
1. `StructuredQuestionCard` renders when a `pending` event arrives (course-create mode)
2. `client.quickCheck.resolve` is called with the correct callId and answer on submit (course-create mode)
3. `StructuredQuestionCard` renders in configure mode
4. Events for other sessions are ignored (session filter in the hook)

## Review (2026-05-23)

**Verdict**: Approve

Smart consolidation: mounting `useQuickCheckBridge` in the shared
`AuthoringChatPane` instead of duplicating in both `CourseCreateTabBody`
and the configure tab body — single subscription, zero double-mounting
risk, both modes pick it up. Card placement mirrors `TeachChatTabBody`
exactly. The `sessionId ?? undefined` conversion is the correct way to
defer subscription until the session is open. Tests cover render +
round-trip in both modes plus the session-filter behavior — exactly what
the story brief asked for.

**Blockers**: none
**Important**: none
**Nits**:
- Inline comment about `sessionId ?? undefined` is load-bearing — keep it
  if the hook signature is ever refactored to accept null directly.

**Notes**: Story has no parent — archive after review.
