---
id: epic-course-create-readiness-startup-invisible
kind: story
stage: implementing
tags: [ui, bug, sessions]
parent: epic-course-create-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Course-create startup invisible

## Brief

The course-create startup handoff isn't surfacing the running chat to the
user. The underlying session does start (engine session opens, events
flow) but the visible chat workspace doesn't connect to it — the user sees
an empty or stale view while the agent is actually running behind the
scenes.

Likely a wiring gap between `session.start` returning its handle and the
chat tab body subscribing to the event stream, or a tab-not-active /
`display:none` isolation interaction (see the `tab-body-isolation` pattern)
where the new tab opens but doesn't auto-activate.

## Repro and fix path

1. Trace the `start → tab.open → navigate → subscribe` sequence (see the
   `session-tab-open-flow` pattern) and identify where the visible binding
   drops for freshly opened course-create sessions.
2. Verify the `activeTabId` / event-stream handoff — likely either the new
   tab id isn't set active before navigation, or the ChatTabBody's effect
   subscribes before the tab is mounted.
3. Add a focused test that opens a course-create session and asserts the
   chat tab body renders the first engine event.

This story is a load-bearing dependency of
`epic-course-create-readiness-unified-landing` — the pre-seed-and-start
flow that ships there assumes the visible chat surfaces when the engine
session opens.
