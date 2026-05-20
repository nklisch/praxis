---
id: idea-empty-session-cleanup
created: 2026-05-19
tags: []
---

Empty sessions — ones that were opened but never had a user message, tool
call, or any episodic activity — should not persist. Today `session.start`
materialises a session row immediately and it stays even if the user
navigates away or closes the tab without interacting, leaving zombie
sessions cluttering the session list and (worse) potentially holding
engine-session resources. Persist sessions lazily: keep the in-memory
handle on `start`, but only write the row + episodic anchor once the
first real action happens (recordUserMessage, tool dispatch, anything
substantive). Anything still empty at tab-close / window-close gets
discarded. Needs to handle the parent-child case (assignment spawns)
and the prewarm/pre-seed flow carefully so we don't drop sessions that
have in-flight pre-seed traffic.
