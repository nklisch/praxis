---
id: feature-empty-session-cleanup-lazy-and-sweep
kind: story
stage: implementing
tags: [core, sessions, ipc, ui, cleanup]
parent: feature-empty-session-cleanup
depends_on: [feature-empty-session-cleanup-fk-migration, feature-empty-session-cleanup-registry]
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Lazy persist, promote, discard, sweep

## Brief

Wire `SessionPromotionRegistry` into the live session lifecycle. After this
story lands, parent-less sessions skip the DB write at `start`, the first
user message promotes them in a single transaction, tab-close discards
unpromoted sessions via a new IPC, and a periodic sweep is the safety net
for window-close / app-crash cases.

## Scope

Per the parent feature body's Unit 3 spec:

### Server-side (packages/core + packages/desktop)

1. **`SessionService.start`** — add `_persistImmediately` internal flag.
   When `false`/unset, register with `SessionPromotionRegistry` instead of
   inserting into `sessions`. Always open engine session eagerly (the
   registry knows the engine session manager and can close it on discard).
2. **`SessionService.send` / `recordUserMessage`** — check the registry.
   If unpromoted, run a single SQLite transaction: insert session row +
   first `user_message` episodic event; on success, registry removes
   the entry. If sessionId is neither in the registry nor in the DB, throw
   `SessionDiscardedError`.
3. **`SessionService.spawnFromAssignment` / `spawnFromNote` / `spawnFromPassage`** —
   pass `_persistImmediately: true` to `start()`. Parent-linked sessions
   persist eagerly (per `--only-questions` decision).
4. **`SessionService.discardIfUnpromoted(sessionId)`** — public method.
   Lookup registry; if entry exists, call `registry.discard(sessionId)`
   and return `{ discarded: true }`. Otherwise `{ discarded: false }`.
5. **`SessionDiscardedError`** — typed error in `packages/core/src/types/`
   that the UI's send error path matches and renders as a friendly toast.
6. **`SessionSweepIndexer`** — new file
   `packages/core/src/services/session/session-sweep-indexer.ts`. Runs on
   a `setInterval` (cadence from `config_kv.session.sweep.cadenceMs`,
   default 10 min). Iterates `registry.entries()`; discards entries older
   than `config_kv.session.sweep.idleMs` (default 30 min). Then runs
   `DELETE FROM tabs WHERE session_id IS NOT NULL AND session_id NOT IN
   (SELECT id FROM sessions) AND session_id NOT IN <registry-ids>`.
   Registered in `buildServices`; clear interval on shutdown.
7. **IPC channel**: `praxis.session.discardIfUnpromoted` —
   `packages/desktop/electron/main/session-channel.ts`. Use the existing
   `wrapEnvelope` + `withSchema` pattern. Input: `{ sessionId: string }`.
   Output: `{ discarded: boolean }`.

### Client-side (packages/client)

8. **`session-client.ts`** — `discardIfUnpromoted(sessionId)` method that
   invokes the new IPC.

### UI (packages/ui)

9. **`useTabs.closeTab`** in `packages/ui/src/context/tabs-context.tsx` —
   after `client.tabs.close(tabId)`, if `tab.kind === "session"` and
   `tab.sessionId !== null`, fire-and-forget
   `client.session.discardIfUnpromoted(tab.sessionId)`. Server returns
   `{ discarded: false }` for already-promoted sessions, so the UI doesn't
   need to know which case applies. Wrap in try/catch and log; this is a
   best-effort cleanup, not a blocker.
10. **Send-error toast** — when `SessionDiscardedError` is the error in the
    streaming-send path, surface a friendly toast: "Session was closed
    while you were typing — please start a new one." Existing
    `lastError` UI in `useStreamedSend` can carry the typed error.

## Acceptance Criteria

- [ ] `SessionService.start` (no parent, no spawn caller) does NOT insert into `sessions`.
- [ ] `tabs.open` followed by no `session.send` leaves no rows in `sessions`.
- [ ] First `session.send` after `start` results in exactly one row in `sessions` plus the first `user_message` event in `episodic_events`, both committed in a single transaction.
- [ ] `spawnFromAssignment` / `spawnFromNote` / `spawnFromPassage` insert into `sessions` immediately at start (registry entry not used).
- [ ] `session.discardIfUnpromoted` IPC works end-to-end: removes registry entry, closes engine session, deletes orphan tabs.
- [ ] UI `closeTab` fires `discardIfUnpromoted` for unpromoted session tabs and ignores errors.
- [ ] Sweep job discards entries older than `idleMs` and removes orphan tabs.
- [ ] Concurrent send + discard: send wins if it gets in first (promotes); discard wins if it gets in first (subsequent send throws `SessionDiscardedError`).
- [ ] SessionDiscardedError surfaces as a friendly toast in the UI.
- [ ] `tests/empty-session-cleanup-e2e.test.ts` covers: start-then-close-without-send leaves no rows; start-then-send-then-close persists; spawn paths persist immediately.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` clean.

## Implementation Notes

- The interval-based sweep can be a plain `setInterval` registered in
  `buildServices` and cleared on shutdown — no need to extend
  `IndexerOrchestrator` with a new `schedule: "interval"` kind unless it
  fits naturally.
- The orphan-tab DELETE in the sweep uses raw SQL with the in-memory
  registry's ids inlined; alternative is a CTE or temp table. Inline is
  fine for small (<100 entries) registry sizes.
- The `_persistImmediately` flag on `start` opts is internal — don't
  expose it via the public IPC schema. Spawn methods set it themselves.

## Out of scope

- Refactoring `EngineSessionManager.openActive` (touched only to expose
  `close(sessionId)` if not already).
- Any change to the `IndexerOrchestrator` schedule kinds.
- UI redesign of session-list or tab-list (the sessions just no longer
  appear in them when empty).
