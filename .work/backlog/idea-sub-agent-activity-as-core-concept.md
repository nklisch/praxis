---
id: idea-sub-agent-activity-as-core-concept
created: 2026-05-09
tags: [ui, content]
---

Make sub-agent activity a first-class concept in the UI rather than hiding it behind the activity rail. Currently the explorer (bootstrap mode's sub-agent) runs and shows a single activity-rail line; the user can't see what it's actually doing turn-by-turn.

Possible directions:
- Inline sub-agent stream rendered into the chat thread (like a collapsed turn block).
- Dedicated sub-agent surface with its own tab.
- Rename "explore" to something more student-facing (per `idea-rename-bootstrap-and-explore`).

Tied to: `idea-rename-bootstrap-and-explore`, `idea-show-tool-calls`.
