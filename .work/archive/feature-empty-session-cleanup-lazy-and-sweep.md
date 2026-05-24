---
id: feature-empty-session-cleanup-lazy-and-sweep
kind: story
stage: done
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

- [x] `SessionService.start` (no parent, no spawn caller) does NOT insert into `sessions`.
- [x] `tabs.open` followed by no `session.send` leaves no rows in `sessions`.
- [x] First `session.send` after `start` results in exactly one row in `sessions` plus the first `user_message` event in `episodic_events`, both committed in a single transaction.
- [x] `spawnFromAssignment` / `spawnFromNote` / `spawnFromPassage` insert into `sessions` immediately at start (registry entry not used).
- [x] `session.discardIfUnpromoted` IPC works end-to-end: removes registry entry, closes engine session, deletes orphan tabs.
- [x] UI `closeTab` fires `discardIfUnpromoted` for unpromoted session tabs and ignores errors.
- [x] Sweep job discards entries older than `idleMs` and removes orphan tabs.
- [x] Concurrent send + discard: send wins if it gets in first (promotes); discard wins if it gets in first (subsequent send throws `SessionDiscardedError`).
- [x] SessionDiscardedError surfaces as a friendly toast in the UI (error message is user-friendly; transported across IPC as message string and displayed in existing `lastError` banner path).
- [x] `tests/empty-session-cleanup-e2e.test.ts` covers: start-then-close-without-send leaves no rows; start-then-send-then-close persists; spawn paths persist immediately.
- [x] `pnpm typecheck && pnpm lint && pnpm test` clean.

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

## Implementation Summary

10 work items across 5 packages, all green.

### Core changes
- `packages/core/src/types/session-discarded-error.ts` — new `SessionDiscardedError` class with `code = "session.discarded"` and user-friendly message string.
- `packages/core/src/types/session-client.ts` — added `discardIfUnpromoted(sessionId)` to `SessionService` interface.
- `packages/core/src/types/index.ts` — re-exports `SessionDiscardedError`.
- `packages/core/src/services/session-service.ts` — `start()` now registers with registry (lazy) vs. `_persistImmediately: true` for spawn paths; `send()` promotes in transaction on first call; `discardIfUnpromoted()` public method; private `_persistSessionRow()` + `_driveEngineTurn()` helpers extracted.
- `packages/core/src/services/session/session-sweep-indexer.ts` — new sweep job using plain `setInterval`; two passes per run: (1) discard idle registry entries, (2) DELETE orphan tabs not in `sessions` and not in registry.
- `packages/core/src/services/index.ts` — re-exports `SessionSweepIndexer` + config types.

### Desktop changes
- `packages/desktop/electron/main/services.ts` — instantiates `SessionSweepIndexer` and calls `.start()`; adds `sessionSweep` to `Services`.
- `packages/desktop/electron/main/index.ts` — calls `services.sessionSweep.stop()` in `before-quit` handler.
- `packages/desktop/electron/main/session-channel.ts` — `praxis.session.discardIfUnpromoted` handler wired via `handleEnvelope`.

### Client changes
- `packages/client/src/services/session-client.ts` — `discardIfUnpromoted()` method invoking the new IPC channel.

### UI changes
- `packages/ui/src/context/tabs-context.tsx` — `closeTab` fires `discardIfUnpromoted` as fire-and-forget for session tabs.
- `packages/ui/src/__tests__/helpers/fake-client.ts` — default `discardIfUnpromoted` stub added so existing tests don't break.

### Tests
- `packages/core/src/services/session/__tests__/session-sweep-indexer.test.ts` — 7 unit tests for the sweep job.
- `tests/empty-session-cleanup-e2e.test.ts` — 7 e2e integration tests covering all promotion/discard scenarios.

## Out of scope

- Refactoring `EngineSessionManager.openActive` (touched only to expose
  `close(sessionId)` if not already).
- Any change to the `IndexerOrchestrator` schedule kinds.
- UI redesign of session-list or tab-list (the sessions just no longer
  appear in them when empty).

## Review (2026-05-23)

**Verdict**: Approve

All 10 work items landed coherently across 5 packages. SessionDiscardedError
exported from `@praxis/core/types`. `_persistImmediately` kept internal (not
exposed via IPC schema — correct). Sweep uses plain setInterval registered
in `buildServices` and cleared in the Electron `before-quit` handler — clean
shutdown wiring. 7 sweep unit tests + 7 e2e tests cover the integration
shape, including the concurrent send-vs-discard race specified in the
parent feature's design decisions. Both `pnpm typecheck` and full test
suite (4634 tests) pass.

**Blockers**: none
**Important**: none
**Nits**:
- Sweep cadence/idle defaults (10min / 30min) are baked in code per the
  design; if these need tuning before any user sees them, expose the
  config_kv accessors in `pnpm db:show` or an admin surface — non-urgent.
- The fake-client `discardIfUnpromoted` stub default added in
  `fake-client.ts` shows the test-helper expansion working as intended
  (no test breakage; new method auto-stubbed).

**Notes**: The full empty-session-cleanup feature now has all 3 child
stories done. Parent feature is at `stage: review`; orchestrator's Phase 9
advancement already fired. Feature review next.
