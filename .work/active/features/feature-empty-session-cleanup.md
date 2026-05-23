---
id: feature-empty-session-cleanup
kind: feature
stage: drafting
tags: [core, sessions, cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Empty session cleanup

## Brief

Empty sessions — ones that were opened but never had a user message, tool
call, or any episodic activity — should not persist. Today `session.start`
materialises a session row immediately and it stays even if the user
navigates away or closes the tab without interacting, leaving zombie
sessions cluttering the session list and (worse) potentially holding
engine-session resources.

Persist sessions lazily: keep the in-memory handle on `start`, but only
write the row plus episodic anchor once the first real action happens
(`recordUserMessage`, tool dispatch — anything substantive). Anything
still empty at tab-close / window-close gets discarded.

## Carve-outs to handle carefully

- **Parent-child case.** Assignment spawns
  (`SessionService.spawnFromAssignment`) create child sessions whose
  `parentSessionId` links back to the tutor. The parent reference makes
  the child meaningful even before the first student turn — confirm the
  cleanup rule doesn't drop a session the parent is waiting on.
- **Prewarm / pre-seed flow.** Some startup paths pre-seed traffic into
  the session before the first visible student input. Don't drop a
  session that has in-flight pre-seed events about to materialize.
- **Engine-session resource release.** If a session is discarded without
  ever persisting, ensure the engine session (if opened) is closed so
  resources don't leak.

## Design questions for feature-design

- Where does the lazy-persist gate live — in `SessionService.start` or in
  the episodic append path?
- How is "first real action" defined precisely (any episodic event? only
  student-originated events?)?
- What's the discard trigger — tab-close hook, periodic sweep, or both?
