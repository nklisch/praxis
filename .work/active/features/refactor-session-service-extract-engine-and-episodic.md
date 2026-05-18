---
id: refactor-session-service-extract-engine-and-episodic
kind: feature
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: extract EngineSessionManager + EpisodicEventRecorder from session-service.ts

## Brief

`packages/core/src/services/session-service.ts` is **1084 lines** and the
hot path through which every tutor turn flows. It tangles three concerns:

1. **EngineSession lifecycle** — `activeSessions` map, `openActive`,
   close-and-reopen on engine swap, history loading for restored
   conversations.
2. **Episodic stream persistence** — per-event `appendEpisodic` with error
   isolation (writes are non-fatal per pattern), turn-ordering invariants
   (recordUserMessage → yield user_message → for-await engine events →
   appendEpisodic → yield).
3. **Public service surface** — `list`, `active`, `notifySession`,
   `spawnFromAssignment`, `start`, `end`, `send`.

The `send()` method (lines 130-277, **148 LoC**, 4 levels of nesting) is
the worst offender: it owns engine-swap detection, history load, entry
open, user-message record, the for-await event loop, per-event persist,
abort handling, and post-turn indexer scheduling.

This is **pure refactor** — the `episodic-append-ordering` pattern and the
`engine-session-lifecycle` pattern (both documented at
`.claude/skills/patterns/`) must be preserved exactly. Engine-swap
behavior, history seeding, and indexer scheduling all stay identical.

## Surface area

- `packages/core/src/services/session-service.ts` (1084) →
  - `session/engine-session-manager.ts` — owns `activeSessions` Map,
    `openActive`, engine-swap detection (lines 166-202), close-old +
    reopen-with-history, `priorTurns` loading from
    `packages/core/src/services/_utils/load-prior-turns.ts` (if extracted)
  - `session/episodic-event-recorder.ts` — owns `appendEpisodic`
    orchestration, per-event error isolation, write-failure logging
  - `session-service.ts` itself — facade: `list`, `active`, `start`, `end`,
    `notifySession`, `spawnFromAssignment`, `send` (delegates the loop body
    to the two extracted modules)
- After extraction, the `send()` method should be ~50 LoC and read as
  episodic-append-ordering with delegation, not 148 LoC of inline state
  management

## Why a feature (not a story)

- 3 concerns to separate behind named boundaries
- Engine-swap is subtle and pattern-load-bearing — needs design pass to
  ensure the extracted manager preserves the close-then-reopen behavior
  exactly (including the test injection seam at `ServiceDeps.engineFactory`)
- The composition root (`SessionServiceImpl`) gets called from
  `ipc-server.ts` and the activity registry — careful to preserve all
  public method signatures

## Discovery findings to design against

- `send()` at lines 130-277: 148 LoC, 4 nesting levels, mixes ≥7 concerns
- Engine swap at lines 166-202: 4 levels deep, close-then-reopen with
  priorTurns loading inline
- `recordUserMessage` call at line 205-214 is tightly coupled to internal
  episodic functions — preserve the load-bearing ordering during extract

## Out of scope

- Changing engine-swap semantics
- Changing the FakeEngine test injection seam (`ServiceDeps.engineFactory`)
- Touching the indexer-orchestrator scheduling

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (especially session-service tests and
      `tests/integration/*` end-to-end paths)
- [ ] `wc -l packages/core/src/services/session-service.ts` < 600
- [ ] `send()` method body < 60 LoC
- [ ] Engine-swap and episodic-append-ordering patterns explicitly
      preserved (verified by their existing tests passing unmodified)
- [ ] `EngineSessionManager` and `EpisodicEventRecorder` are exported and
      individually testable

## Risk

**Medium** — hot path through every turn. Strong test coverage; behavior
must not drift. The atomicity here is the ordering invariant
(`recordUserMessage → yield user_message → for-await → appendEpisodic →
yield`) — if the extracted modules reorder anything, replay correctness
breaks.

## Rollback

`git revert <commit>` is clean per extracted module. Recommend landing the
EpisodicEventRecorder first (smaller scope, independently testable), then
EngineSessionManager.

## Design correction (2026-05-18, refactor-design pass)

After reading session-service.ts in its current form (1084 LoC), the original
"two-module" proposal (EngineSessionManager + EpisodicEventRecorder) is
half-right:

- **EngineSessionManager IS worth extracting**: the `activeSessions: Map`,
  `openActive(args)`, and engine-swap-detection-and-reopen logic (lines
  ~166-202 of `send()`) cluster cleanly. ~100 LoC of pure lifecycle code.

- **EpisodicEventRecorder is NOT worth extracting**: `appendEpisodic` is
  already an imported utility (lives in
  `packages/core/src/services/_episodic/`). The "recorder" would be a
  wrapper around a 5-line for-await loop body that has session-specific
  abort-cascade + subagent-interrupt logic. Extracting it would create a
  module with one consumer and a leaky abstraction (signal handling +
  interrupt cascading wants the full session context).

The honest split: extract EngineSessionManager only. Result:

- `send()` method drops from 148 LoC to ~80 LoC (engine-swap detection
  becomes a single call to `engineManager.acquire(...)`)
- session-service.ts drops from 1084 to ~950-980 LoC (modest, but the
  responsibility separation is the value, not the LoC delta)
- `activeSessions` map + reopen logic is testable in isolation

This is a **smaller** refactor than the original feature body suggested.
That's honest — service splits are case-by-case, and the "second module"
proposal didn't survive contact with the actual code.

## Refactor Overview

Single child story. Extract EngineSessionManager from session-service.ts;
the rest of the file stays as the facade.

## Refactor Steps

### Step 1: Extract EngineSessionManager
**Priority**: Medium (modest LoC win, but clearer responsibility for the most-tangled method)
**Risk**: Medium (hot path through every tutor turn; strong test coverage de-risks)
**Files**:
- NEW: `packages/core/src/services/session/engine-session-manager.ts`
- `packages/core/src/services/session-service.ts` (extract from)
**Story**: `refactor-session-service-extract-engine-and-episodic-step-1-engine-manager`

**Surface area**:
- `activeSessions: Map<string, ActiveEntry>` — moves to manager (private)
- `private async openActive(args)` — moves to manager (public method on manager)
- Engine-swap-detection-and-reopen block (lines ~166-202 inside send()) — moves into a new manager method `acquire(args)` that handles the entire "get-or-create-and-swap" flow

**Manager API** (sketch — refine during implementation):

```ts
// packages/core/src/services/session/engine-session-manager.ts
import type { Logger, Mode, StudentId, CourseId, AssignmentId, EngineSession } from "@praxis/core/types";
// ... other imports

export interface ActiveEntry {
  readonly handle: EngineSession;
  readonly engineId: string;
  turnInFlight: boolean;
  // ... whatever else lives on the current ActiveEntry shape
}

export interface EngineSessionManagerDeps {
  // Whatever subset of ServiceDeps the manager needs:
  // - db (for loadConversationHistory)
  // - log
  // - secretStorage (for readEngineConfig... actually that's only used in send())
  // - engineFactory (for openActive — the FakeEngine test seam)
  // - readonly resolveMode: (modeId: string) => Mode (or similar — for openActive's mode param)
}

export class EngineSessionManager {
  private readonly activeSessions = new Map<string, ActiveEntry>();

  constructor(private readonly deps: EngineSessionManagerDeps) {}

  /**
   * Get the active entry for a session, creating or swapping as needed.
   * - If no active entry: open a new one with priorTurns from history.
   * - If active entry exists with different engineId: close it, open new one.
   * - Else: return the existing entry.
   */
  async acquire(args: {
    sessionId: SessionId;
    currentEngineId: string;
    mode: Mode;
    studentId: StudentId;
    courseId?: CourseId;
    assignmentId?: AssignmentId;
  }): Promise<ActiveEntry> {
    let entry = this.activeSessions.get(args.sessionId);
    if (entry && entry.engineId !== args.currentEngineId) {
      this.deps.log.info("engine swap detected; closing active session", {
        sessionId: args.sessionId,
        from: entry.engineId,
        to: args.currentEngineId,
      });
      const oldEngineId = entry.engineId;
      await entry.handle.close().catch((err) => {
        this.deps.log.warn("session.engine_swap.close_failed", {
          sessionId: args.sessionId,
          oldEngineId,
          err: serializeError(err),
        });
      });
      this.activeSessions.delete(args.sessionId);
      entry = undefined;
    }
    if (!entry) {
      const priorTurns = loadConversationHistory({ db: this.deps.db, sessionId: args.sessionId });
      entry = await this.openActive({ ...args, priorTurns });
    }
    return entry;
  }

  /** Direct access for `start()` which opens without prior-turn seeding. */
  async openActive(args: {
    sessionId: SessionId;
    engineId: string;
    mode: Mode;
    studentId: StudentId;
    priorTurns?: ConversationHistory;
    courseId?: CourseId;
    assignmentId?: AssignmentId;
  }): Promise<ActiveEntry> {
    // Move the existing private openActive method's body here verbatim.
    // ...
  }

  /** Close + remove a specific session (for end()/shutdown()). */
  async close(sessionId: SessionId): Promise<void> {
    const entry = this.activeSessions.get(sessionId);
    if (entry) {
      await entry.handle.close();
      this.activeSessions.delete(sessionId);
    }
  }

  /** Close all (for shutdown()). */
  async closeAll(): Promise<void> {
    const ids = Array.from(this.activeSessions.keys());
    await Promise.all(ids.map((id) => this.close(brandId<"SessionId">(id))));
  }

  /** Read-only access for `active()`/`list()` and other facade methods. */
  get(sessionId: SessionId): ActiveEntry | undefined {
    return this.activeSessions.get(sessionId);
  }

  /** For lazy-delivery in notifySession()/spawn methods. */
  has(sessionId: SessionId): boolean {
    return this.activeSessions.has(sessionId);
  }
}
```

**Updated session-service.ts `send()`** (target ~80 LoC):

```ts
async *send(sessionId, message, signal): AsyncIterable<EngineEvent> {
  const turnIndex = nextTurnIndex(this.deps.db, sessionId);
  const turnLog = this.deps.log.child({ component: "session-service", sessionId, turnIndex });
  turnLog.debug("turn.start", { messageLength: message.length });

  // Pre-flight
  const sessionRow = this.deps.db.select()...get();
  if (!sessionRow) { yield error("session.not_found"); return; }
  if (sessionRow.endedAt) { yield error("session.ended"); return; }

  const mode = this.requireMode(sessionRow.modeId);
  const studentId = brandId<"StudentId">(sessionRow.studentId);
  const currentEngineId = readEngineConfig(...).engineId;

  // Engine session lifecycle — single call to manager.
  const entry = await this.engineManager.acquire({
    sessionId, currentEngineId, mode, studentId,
    ...(sessionRow.courseId !== null && { courseId: brandId<"CourseId">(sessionRow.courseId) }),
    ...(sessionRow.assignmentId !== null && sessionRow.assignmentId !== undefined && {
      assignmentId: brandId<"AssignmentId">(sessionRow.assignmentId),
    }),
  });

  // 1. Record + echo user message.
  recordUserMessage({ db: this.deps.db, sessionId, studentId, engineId: entry.engineId, modeId: mode.id, turnIndex, content: message });
  yield { type: "user_message", content: message };

  // 2. Drive engine + persist events
  entry.turnInFlight = true;
  try {
    for await (const event of entry.handle.send(message, signal)) {
      try {
        appendEpisodic({ db: this.deps.db, sessionId, studentId, engineId: entry.engineId, modeId: mode.id, turnIndex, event });
      } catch (cause) {
        yield error("episodic.write_failed", cause);
      }
      yield event;

      if (signal?.aborted) {
        this.deps.subAgent?.interruptAllForSession(sessionId);
        const interrupted = { type: "interrupted", reason: "user_cancel" };
        try {
          appendEpisodic({ ...interrupted args });
        } catch { /* non-fatal */ }
        yield interrupted;
        return;
      }
    }
  } catch (cause) {
    yield error("engine.send_failed", cause);
  } finally {
    entry.turnInFlight = false;
  }

  // Phase 7: indexer schedule
  this.deps.indexerOrchestrator?.scheduleAfterTurn({ studentId, sessionId: brandId<"SessionId">(sessionId) });
}
```

**Implementation notes**:
- Each method of `SessionServiceImpl` that touches `this.activeSessions` directly (currently: `start`, `send`, `end`, `active`, `list`, `notifySession`, `spawnFromAssignment`, `spawnFromNote`, `spawnFromPassage`, `shutdown`) — verify each one's access pattern, route through the manager:
  - `start()`: calls `openActive` directly — replace with `engineManager.openActive(...)`.
  - `send()`: already covered above with `engineManager.acquire(...)`.
  - `end()`: closes a single session — `engineManager.close(sessionId)`.
  - `active()`/`list()`: read-only `this.activeSessions.get(...)`/iteration — `engineManager.get(...)` (add `entries()` if list needs iteration).
  - `notifySession()`/`spawn*()`: similar `get`/`has` checks — route through manager.
  - `shutdown()`: closes all — `engineManager.closeAll()`.
- Pre-existing helpers (`requireMode`, `resolveResumeEngineSessionId`, `recordEngineSessionId`) stay in session-service.ts — they're stateless or operate on `this.deps`, not on `activeSessions`.
- `ServiceDeps` — the manager needs `db`, `log`, `engineFactory` (or whatever `openActive` needs to construct engine sessions), and possibly `resolveMode` (the mode-lookup callback). Construct the manager inside `SessionServiceImpl`'s constructor from `this.deps`.
- The test injection seam `engineFactory?: fn` in `ServiceDeps` (for `FakeEngine`) must flow through to the manager. Either pass it as a manager dep, or have the manager accept a factory parameter.
- `ConversationHistory` import + `loadConversationHistory` call move into the manager (only `acquire` uses them).
- `serializeError` import (used in the swap-failure log line) — both manager and facade may need it now; that's fine.

**Acceptance criteria**:
- `pnpm --filter @praxis/core typecheck && pnpm --filter @praxis/core test` green
- Critical tests pass unmodified:
  - All `session-service.test.ts` files (and adjacent test files for engine lifecycle)
  - `tests/integration/*` end-to-end paths if any cover session lifecycle
- `wc -l packages/core/src/services/session-service.ts` < 1000 (target ~950)
- `send()` method body < 90 LoC
- `EngineSessionManager` class exists at `packages/core/src/services/session/engine-session-manager.ts` and is exported
- `engine-session-lifecycle` and `episodic-append-ordering` patterns explicitly preserved (verified by their existing tests passing unmodified)
- The `engineFactory?: fn` test seam still works for `FakeEngine`

**Risk**: Medium. Hot path. The acquire-with-swap-detection is the most subtle code in the file. Strong test coverage (1084 LoC of source corresponds to ~800+ LoC of tests).

**Rollback**: `git revert <commit>` — clean single commit reverts the extract.

---

## Implementation Order

1. Single step.

## Atomic-step acknowledgments

None. The extraction preserves the public `SessionService` interface; consumers don't change.

## Out-of-scope follow-ups

- **EpisodicEventRecorder extraction** — explicitly dropped per the design correction above. Inline for-await loop is shorter than the wrapper would be.
- **Spawn-methods extraction** (`spawnFromAssignment`, `spawnFromNote`, `spawnFromPassage`) — they're cohesive and not god-shaped. Leave as facade methods. A future refactor could extract a `SpawnService` if the methods accrete more logic.
