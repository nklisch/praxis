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

## Design decisions (feature-design --only-questions, 2026-05-23)

- **Lazy-persist gate location: `SessionService.start`.** `start` returns
  an in-memory handle and skips the DB write. The first promote-event
  writes the session row + episodic anchor in a single transaction.
  Empty sessions never touch the DB.
- **Promote rule: user-meaningful only.** The guiding principle is "would
  the student want this session in their history to potentially resume?"
  Primary rule: promote on the first `user_message`. Carve-outs:
  - `parentSessionId` set → persist immediately at `start` (assignment-
    spawn child has meaning before any student turn — see below).
  - Future exceptions allowed for genuinely substantive user-initiated
    state if they emerge. Don't expand the rule pre-emptively; the
    default of "needs a user message to matter" keeps the session list
    clean of clicked-but-empty surfaces.
  - Explicitly NOT promote-triggers: prewarm / pre-seed events,
    model-originated turns with no preceding user message, system_note,
    tool_call/tool_result that fires without a student message.
- **Discard trigger: tab-close hook + periodic sweep (both).** Tab-close
  covers the common case (user navigates away). Periodic sweep handles
  window-close / navigation-away / app-crash leaks. Sweep cadence and
  idle threshold are implementation-time calls; lean conservative (e.g.,
  10 min sweep, 30 min idle) to avoid dropping a session the user
  briefly walked away from.
- **Parent-child case: persist immediately when `parentSessionId` is
  set.** A parent-linked child has meaning before the student turn (the
  parent is waiting on `notifySession`). Cheapest, safest, no risk of
  dropping a session the parent depends on. Lazy-persist applies only to
  parent-less sessions.

## Open for feature-design

The decisions above pin direction; feature-design will resolve:

- Exact engine-session resource-release path when an in-memory-only
  session is discarded (must close any opened `EngineSession`).
- Sweep cadence and idle-timeout thresholds (recommend conservative
  defaults; expose via `config_kv` if there's a reason to tune).
- Whether the tab-close hook lives in the UI (`useTabs` cleanup) or in
  the IPC layer (server-side detection of socket disconnect).
- Concurrent-write protection — if a tab is closing at exactly the same
  moment as a user_message is sending, which wins?
