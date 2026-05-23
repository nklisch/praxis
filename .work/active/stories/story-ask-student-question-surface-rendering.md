---
id: story-ask-student-question-surface-rendering
kind: story
stage: implementing
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
