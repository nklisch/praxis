---
id: feature-empty-session-cleanup
kind: feature
stage: review
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

## Design decisions (feature-design, 2026-05-23, autopilot)

Open questions from `--only-questions` resolved:

- **Engine-session release on discard**: `SessionPromotionRegistry.discard(sessionId)`
  calls `engineSessionManager.close(sessionId)` to release any open engine
  resources before removing the in-memory entry.
- **Sweep cadence / idle threshold**: 10 min cadence, 30 min idle threshold.
  Both stored in `config_kv` under `session.sweep.cadenceMs` and
  `session.sweep.idleMs` with the defaults baked in code. Sweep job lives
  in a new `SessionSweepIndexer` (post-turn style indexer; runs on its own
  timer rather than per-turn).
- **Tab-close hook**: UI-side trigger, server-side enforcement. The UI's
  `useTabs.closeTab` dispatches a new `client.session.discardIfUnpromoted`
  IPC call after `tabs.close`. The server owns the discard logic (engine
  close, registry remove, in-memory state cleanup). The periodic sweep is
  the safety net for window-close / app-crash cases.
- **Concurrent-write protection**: `SessionPromotionRegistry.promote()` and
  `discard()` operate on a single in-memory `Map<SessionId, UnpromotedSessionState>`
  in the Node main process — single-threaded runtime means promote/discard
  are atomic with respect to each other. Promote runs the persist transaction
  *while still holding the registry entry*; on success it removes the entry.
  Discard removes the entry first; if a concurrent `send` arrives after
  discard, it sees no registry entry AND no DB row, and returns
  `SessionDiscardedError` (a typed error the UI surfaces as a friendly
  "session was closed while you were typing — please try again" toast).

## Design discovery

The original brief decision stated "Empty sessions never touch the DB."
Honoring that literally requires either (a) dropping the
`tabs.sessionId → sessions.id` foreign key so `tabs.open` can persist a tab
row pointing at an unpromoted (in-memory-only) session, or (b) making
`tabs.open` itself lazy with an in-memory tab-queue that flushes on promote.

Decision: **option (a) — drop the FK constraint via migration.** The
queued-tab approach is cleaner conceptually but complicates `tabs.open`'s
contract (the returned `TabSummary` would carry a temp id that changes on
promote, breaking navigation). Dropping the FK pushes orphan-tab cleanup
to the sweep job — a known, well-bounded responsibility — without
distorting the tabs API. The cascade-delete safety net is replicated in
`SessionPromotionRegistry.discard()` (deletes tabs WHERE sessionId = id)
and in the sweep job's orphan-tab pass.

## Architectural choice

**SessionPromotionRegistry** (new in-memory service) + **lazy-persist gate
in `SessionService.start`** + **promote-on-first-user-message** in
`SessionService.send` + **discard via IPC + sweep job**. The registry is
the single source of truth for "unpromoted sessions". Both
`SessionService` and `TabsService` consult it via injected reference;
no circular deps.

Alternatives considered:
- **Always-persist with `promoted:boolean` column + aggressive sweep** —
  simpler implementation (no FK migration, no in-memory map), but conflicts
  with the locked `--only-questions` decision "Empty sessions never touch
  the DB". Rejected.
- **Lazy tabs (queue in memory) without FK migration** — preserves the FK,
  but `tabs.open` returns temp ids that change on promote. Rejected for
  the API distortion.

## Implementation Units

### Unit 1: SessionPromotionRegistry service

**File**: `packages/core/src/services/session/session-promotion-registry.ts`
**Story**: `feature-empty-session-cleanup-registry`

```typescript
export interface UnpromotedSessionState {
  sessionId: SessionId;
  studentId: StudentId;
  modeId: string;
  engineId: string;
  courseId?: CourseId;
  assignmentId?: AssignmentId;
  startedAt: Timestamp;
}

export interface SessionPromotionRegistry {
  /** Register an unpromoted session at SessionService.start. */
  register(state: UnpromotedSessionState): void;
  /** Lookup unpromoted state; returns null if promoted or never registered. */
  get(sessionId: SessionId): UnpromotedSessionState | null;
  /**
   * Atomically promote: run `txFn` (the caller's persistence transaction)
   * with the unpromoted state, then remove from the registry on success.
   * Throws if sessionId is not registered (already promoted or never started).
   */
  promote<T>(
    sessionId: SessionId,
    txFn: (state: UnpromotedSessionState) => T,
  ): T;
  /**
   * Atomically discard: remove from registry, close engine session,
   * delete any tabs pointing at this sessionId.
   */
  discard(sessionId: SessionId): Promise<void>;
  /** Iterate entries for sweep. */
  entries(): IterableIterator<[SessionId, UnpromotedSessionState]>;
}

export class SessionPromotionRegistryImpl implements SessionPromotionRegistry {
  private readonly map = new Map<SessionId, UnpromotedSessionState>();

  constructor(
    private readonly deps: {
      db: Database;
      log: Logger;
      engineSessionManager: () => EngineSessionManager; // lazy resolver
    },
  ) {}

  // ... implementations
}
```

**Implementation Notes**:
- The `engineSessionManager` is injected as a `() => EngineSessionManager`
  thunk (per the `lazy-resolver-thunk` pattern) to avoid construction-order
  problems — `EngineSessionManager` is created late in `buildServices`.
- `discard` runs an idempotent flow: lookup entry → close engine (if open)
  → DELETE tabs WHERE sessionId → log → remove from map. If any step
  throws, log and continue (idempotent best-effort).
- `promote` is synchronous-with-tx: the caller passes a synchronous `txFn`
  that runs inside an SQLite transaction. Registry removal happens after
  txFn returns successfully.

**Acceptance Criteria**:
- [ ] `register` followed by `get` returns the same state object.
- [ ] `promote` removes the entry and returns the txFn's return value.
- [ ] `promote` throws when sessionId is not registered.
- [ ] `discard` is idempotent (calling twice doesn't throw).
- [ ] `discard` closes engine session via injected manager.
- [ ] `discard` deletes tabs WHERE sessionId = id.
- [ ] `entries()` reflects registered-and-not-yet-promoted-or-discarded.

---

### Unit 2: Drop tabs.sessionId FK constraint (migration + schema)

**File**: `drizzle/<NNNN>_drop_tabs_session_fk.sql` + `packages/memory/src/schema.ts`
**Story**: `feature-empty-session-cleanup-fk-migration`

```sql
-- drizzle/<NNNN>_drop_tabs_session_fk.sql
-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT; recreate table.
PRAGMA foreign_keys=OFF;

CREATE TABLE tabs_new (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  session_id TEXT,                    -- FK removed
  document_id TEXT REFERENCES documents(document_id) ON DELETE CASCADE,
  title TEXT,
  sort_order INTEGER NOT NULL,
  opened_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  closed_at INTEGER
);

INSERT INTO tabs_new SELECT * FROM tabs;
DROP TABLE tabs;
ALTER TABLE tabs_new RENAME TO tabs;

-- Recreate indexes (mirror originals — copy from prior migration).
CREATE INDEX tabs_student_idx ON tabs(student_id);
CREATE INDEX tabs_session_idx ON tabs(session_id);

PRAGMA foreign_keys=ON;
```

```typescript
// packages/memory/src/schema.ts — update sessionId column declaration
export const tabs = sqliteTable("tabs", {
  // ...
  sessionId: text("session_id"),  // FK removed; orphan cleanup via sweep
  // ...
});
```

**Implementation Notes**:
- This is a destructive migration. Run on a backup of `.praxis/dev.db`
  first to verify; production users get the migration on next launch via
  the existing migration runner.
- Update the schema definition to drop the `.references(...)` chain on
  `sessionId`.
- Add a comment in the schema explaining orphan-tab cleanup lives in the
  sweep job.

**Acceptance Criteria**:
- [ ] Migration runs cleanly against the dev DB.
- [ ] After migration, `INSERT INTO tabs (..., session_id, ...) VALUES (..., 'nonexistent', ...)` succeeds.
- [ ] Existing data preserved across migration.
- [ ] `pnpm db:migrate` followed by `pnpm db:show` shows the new schema.
- [ ] `pnpm typecheck` clean after schema edit.

---

### Unit 3: Lazy-persist + promote + discard + sweep wiring

**File**: `packages/core/src/services/session-service.ts` + new sweep indexer
**Story**: `feature-empty-session-cleanup-lazy-and-sweep`

```typescript
// packages/core/src/services/session-service.ts
async start(opts: {
  courseId?: CourseId;
  assignmentId?: AssignmentId;
  modeId: string;
  /** internal: when set, persist immediately (parent-linked sessions). */
  _persistImmediately?: boolean;
}): Promise<SessionHandle> {
  const sessionId = generateSessionId();
  const startedAt = Date.now() as Timestamp;
  const engineId = await this.deps.engineConfig.getActiveEngineId();
  const studentId = brandId<"StudentId">(getOrCreateDefaultStudentId(this.deps.db));

  const state: UnpromotedSessionState = {
    sessionId, studentId, modeId: opts.modeId, engineId, startedAt,
    ...(opts.courseId !== undefined && { courseId: opts.courseId }),
    ...(opts.assignmentId !== undefined && { assignmentId: opts.assignmentId }),
  };

  if (opts._persistImmediately === true) {
    // Parent-linked sessions persist immediately; skip the registry.
    this.persistSessionRow(state);
  } else {
    this.deps.sessionPromotionRegistry.register(state);
  }

  // Open engine session eagerly (existing behavior; registry knows the
  // engine session manager so discard() can close it later).
  await this.deps.engineSessionManager.openActive(sessionId, opts);

  return { sessionId, modeId: opts.modeId, startedAt };
}

// spawnFromAssignment / spawnFromNote / spawnFromPassage call start() with
// `_persistImmediately: true` — see the per-method changes.

async send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
  // If this session is unpromoted, promote it now (single tx: insert
  // session row + first user_message episodic event).
  const unpromoted = this.deps.sessionPromotionRegistry.get(sessionId);
  if (unpromoted !== null) {
    this.deps.db.transaction(() => {
      this.deps.sessionPromotionRegistry.promote(sessionId, (state) => {
        this.persistSessionRow(state);
        // recordUserMessage runs inside the same tx
        recordUserMessage({ db: this.deps.db, sessionId, content: message, ts: Date.now() });
      });
    });
  } else {
    // Already promoted (or parent-linked): normal path
    if (!this.sessionExistsInDb(sessionId)) {
      throw new SessionDiscardedError(sessionId);
    }
    recordUserMessage({ db: this.deps.db, sessionId, content: message, ts: Date.now() });
  }
  // ... rest of send (engine loop) unchanged
}

async discardIfUnpromoted(sessionId: SessionId): Promise<{ discarded: boolean }> {
  const unpromoted = this.deps.sessionPromotionRegistry.get(sessionId);
  if (unpromoted === null) return { discarded: false };
  await this.deps.sessionPromotionRegistry.discard(sessionId);
  return { discarded: true };
}
```

```typescript
// packages/core/src/services/session/session-sweep-indexer.ts (new)
export class SessionSweepIndexer implements Indexer {
  id = "session-sweep";
  schedule = "interval" as const; // new schedule kind, or piggyback "post-turn" with internal timer

  constructor(
    private readonly deps: {
      registry: SessionPromotionRegistry;
      db: Database;
      log: Logger;
      config: () => { cadenceMs: number; idleMs: number };
    },
  ) {}

  async run(): Promise<void> {
    const { idleMs } = this.deps.config();
    const cutoff = Date.now() - idleMs;
    // 1. Discard idle unpromoted sessions
    for (const [sid, state] of this.deps.registry.entries()) {
      if (state.startedAt < cutoff) {
        await this.deps.registry.discard(sid);
      }
    }
    // 2. Orphan-tab cleanup (FK is gone, so we sweep here)
    this.deps.db.run(sql`
      DELETE FROM tabs
      WHERE session_id IS NOT NULL
        AND session_id NOT IN (SELECT id FROM sessions)
        AND session_id NOT IN (${sql.raw(Array.from(this.deps.registry.entries()).map(([sid]) => `'${sid}'`).join(",") || "''")})
    `);
  }
}
```

```typescript
// packages/desktop/electron/main/session-channel.ts — new IPC channel
ipcMain.handle("praxis.session.discardIfUnpromoted",
  wrapEnvelope("praxis.session.discardIfUnpromoted", log,
    withSchema(z.object({ sessionId: z.string() }), async ({ sessionId }) => {
      return services.session.discardIfUnpromoted(brandId<"SessionId">(sessionId));
    })));
```

```typescript
// packages/client/src/services/session-client.ts — new method
async discardIfUnpromoted(sessionId: SessionId): Promise<{ discarded: boolean }> {
  return this.transport.invoke("praxis.session.discardIfUnpromoted", { sessionId });
}
```

```typescript
// packages/ui/src/context/tabs-context.tsx — useTabs.closeTab augmentation
const closeTab = useCallback(async (tabId: TabId) => {
  const tab = openTabs.find((t) => t.id === tabId);
  // ... existing closeTab logic ...
  await client.tabs.close(tabId);
  if (tab?.kind === "session" && tab.sessionId !== null) {
    // Best-effort: discard if the session never received any user input.
    // Server returns { discarded: false } for already-promoted sessions.
    try {
      await client.session.discardIfUnpromoted(tab.sessionId);
    } catch (err) {
      log.warn("[useTabs] discardIfUnpromoted failed (non-blocking):", err);
    }
  }
}, [client, openTabs, ...]);
```

**Implementation Notes**:
- Add a `SessionDiscardedError` typed error in `packages/core/src/types/`
  and surface as a friendly toast in the UI's send error path.
- The sweep indexer's schedule kind may need a new "interval" variant in
  `IndexerOrchestrator`. If that's too invasive, run the sweep on a plain
  `setInterval` registered at service construction (simpler; just remember
  to clear on shutdown).
- The orphan-tab DELETE uses raw SQL with the in-memory registry's ids
  inlined; alternative is a CTE or a temp table. Inline is fine for small
  registry sizes (<100 entries typical).

**Acceptance Criteria**:
- [ ] `SessionService.start` (no parent) does NOT insert into `sessions`.
- [ ] `tabs.open` followed by no `session.send` leaves no rows in `sessions`.
- [ ] First `session.send` after `start` results in exactly one row in `sessions` plus the first `user_message` event in `episodic_events`.
- [ ] `spawnFromAssignment` / `spawnFromNote` / `spawnFromPassage` persist immediately (no registry entry).
- [ ] `session.discardIfUnpromoted` removes registry entry, closes engine session, deletes tabs.
- [ ] UI `closeTab` fires `discardIfUnpromoted` for unpromoted session tabs.
- [ ] Sweep job discards entries older than `idleMs` and removes orphan tabs.
- [ ] Concurrent send + discard: send wins if it gets in first (promotes); discard wins if it gets in first (subsequent send throws `SessionDiscardedError`).
- [ ] Build + lint + tests green.

---

## Implementation Order

1. **`feature-empty-session-cleanup-fk-migration`** — drop tabs FK. Unblocks the rest. Small; can run first.
2. **`feature-empty-session-cleanup-registry`** — `SessionPromotionRegistry` service. Pure in-memory; no DB schema changes. Can land in parallel with #1 in principle (registry doesn't depend on FK), but #3 needs both.
3. **`feature-empty-session-cleanup-lazy-and-sweep`** — lazy-persist gate, promote, discardIfUnpromoted IPC, UI closeTab hook, sweep indexer. Depends on #1 (FK gone) and #2 (registry exists).

## Testing

### Unit Tests
- `session-promotion-registry.test.ts` — register/get/promote/discard/idempotent/entries
- `session-service.test.ts` — lazy-start does not insert; first send promotes; spawn paths persist immediately; discardIfUnpromoted handles all states; SessionDiscardedError thrown on send-after-discard
- `session-sweep-indexer.test.ts` — sweeps idle entries; cleans orphan tabs; respects cadence/idle thresholds from config
- `tabs-service.test.ts` (regression) — tab insert with unpromoted sessionId no longer fails

### Integration
- `tests/empty-session-cleanup-e2e.test.ts` — start session → close tab without sending → assert no rows; start → send → close tab → assert session persists
- Manual: start a session, close the tab, restart the app, confirm the session list is clean

## Risks

- **Migration failure on existing user data.** Mitigation: the migration is
  SQLite ALTER-table-via-recreate, well-trodden in this codebase
  (Phase 14 tabs table was created the same way). Test on a backup before
  release.
- **Concurrent-write race.** The single-threaded Node main process makes
  this trivial *in theory*, but tab-close → IPC → discard travels through
  the IPC queue and could interleave with `send`. The `SessionDiscardedError`
  contract makes the race a recoverable UX issue rather than data
  corruption.
- **Engine resource leak if `discard` fails.** Mitigation: `discard` is
  idempotent and logs all failures; the next sweep retries.
- **Tab-close UX flicker.** If `discardIfUnpromoted` takes >100ms, the tab
  may "appear" briefly in the recent-tabs list. Mitigation: discard is
  fire-and-forget from the UI; the user has already navigated away.

## Children complete (orchestrator, 2026-05-23)

All 3 child stories landed and advanced to `stage: review`:

- `feature-empty-session-cleanup-fk-migration` — migration 0026 dropped the tabs.sessionId FK; schema updated; verified on fresh DB. Commits: `25f8e59`, `0eacd0b`.
- `feature-empty-session-cleanup-registry` — `SessionPromotionRegistry` service + impl + 16 unit tests; ServiceDeps wired in `services.ts`. Commit: `9c0bbe7`.
- `feature-empty-session-cleanup-lazy-and-sweep` — lazy-persist in `SessionService.start`, promote-on-first-message in `send`, `discardIfUnpromoted` IPC, UI `closeTab` hook, `SessionSweepIndexer` (setInterval-based), 7 sweep unit tests + 7 e2e tests. Commit: `fc62c15`.

Integration verification: `pnpm typecheck && pnpm test` clean across the
workspace (4634+ tests passing).

Feature advancing `implementing → review` for final pass.
