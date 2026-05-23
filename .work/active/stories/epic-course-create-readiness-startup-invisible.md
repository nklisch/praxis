---
id: idea-course-create-startup-invisible
created: 2026-05-19
tags: [bug]
---

The course-create startup handoff isn't surfacing the running chat to the
user. It looks like the underlying session does start (engine session opens,
events flow) but the visible chat workspace doesn't connect to it — so the
user sees an empty or stale view while the agent is actually running
behind the scenes. Likely a wiring gap between `session.start` returning
its handle and the chat tab body subscribing to the event stream — or a
tab-not-active / display:none isolation interaction where the new tab
opens but doesn't auto-activate. Worth tracing the
start → tab.open → navigate → subscribe sequence to find where the visible
binding drops, and verifying the activeTabId / event-stream handoff for
freshly opened course-create sessions.
