---
id: idea-stop-button-cancels-sub-agents
created: 2026-05-13
tags: [bug]
---

The chat stop button does not reliably stop a running session — sub-agents (Claude Code Task sub-agents spawned by the tutor) continue executing after the user clicks stop, so tool calls and messages keep arriving for some time afterward. Cancellation needs to propagate down the agent tree: aborting the parent turn should also abort any in-flight sub-agent invocations and their pending tool calls, not just stop the outer session loop. Until this is fixed, "stop" feels broken — the UI returns control while work keeps happening behind it.
