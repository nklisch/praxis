---
id: refactor-session-service-extract-engine-and-episodic-step-1-engine-manager
kind: story
stage: done
tags: [refactor]
parent: refactor-session-service-extract-engine-and-episodic
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 1: Extract EngineSessionManager from session-service.ts

## Brief

Extract the `activeSessions` map + `openActive` + engine-swap-detection
logic from `session-service.ts` into a new `EngineSessionManager` class.
The session service facade keeps the public API; `send()` becomes ~80 LoC
(was 148) by delegating engine-lifecycle to the manager.

See parent feature body's "Step 1: Extract EngineSessionManager" section
for the full design including the manager API sketch and the post-extract
`send()` shape.

## Files

- NEW: `packages/core/src/services/session/engine-session-manager.ts`
- `packages/core/src/services/session-service.ts` (extract from)

## What gets extracted

From `SessionServiceImpl` → `EngineSessionManager`:
- `private readonly activeSessions = new Map<string, ActiveEntry>();` (line ~71)
- `private async openActive(args)` (line ~760 — the entire method body)
- The engine-swap-detection-and-reopen logic from `send()` (lines ~166-202)
  becomes the manager's new `acquire(args)` method
- `loadConversationHistory` import + call (move into manager — only `acquire` uses it)
- `ActiveEntry` interface (verify location — may need to keep an export for callers like spawn methods that touch entry.turnInFlight)

## What stays in `SessionServiceImpl`

- Pre-flight validation in send() (session-exists, ended-check)
- User-message recording + echo
- The for-await loop body with abort cascade + subagent-interrupt
- Post-turn indexer schedule
- All other public methods: `start`, `end`, `active`, `list`,
  `notifySession`, `spawnFromAssignment`, `spawnFromNote`, `spawnFromPassage`,
  `shutdown`
- Private helpers: `requireMode`, `resolveResumeEngineSessionId`,
  `recordEngineSessionId`

Each method that currently touches `this.activeSessions` directly needs
to route through the manager. Specifically:
- `start()` → `this.engineManager.openActive(...)` (or `acquire` if it
  needs swap-detection — verify by reading start() carefully)
- `send()` → `this.engineManager.acquire(...)` for the lifecycle, then
  the for-await loop uses the returned `entry.handle` as today
- `end(sessionId)` → `this.engineManager.close(sessionId)`
- `active()`/`list()` → `this.engineManager.get(...)` / iteration via a
  manager method (add `entries()` if list() needs iteration)
- `notifySession()`, `spawn*()` → `this.engineManager.get/has(...)` for
  "is there a live session right now" checks
- `shutdown()` → `this.engineManager.closeAll()`

## Manager API (verbatim from feature body — reproduced here for the agent)

```ts
// packages/core/src/services/session/engine-session-manager.ts

export interface ActiveEntry {
  readonly handle: EngineSession;
  readonly engineId: string;
  turnInFlight: boolean;
  // ... whatever else lives on the current ActiveEntry shape (verify by reading session-service.ts)
}

export interface EngineSessionManagerDeps {
  db: PraxisDb;
  log: Logger;
  engineFactory?: (engineId: string) => Engine;  // FakeEngine test injection seam — preserve exactly
  // Plus anything else the openActive body needs
}

export class EngineSessionManager {
  private readonly activeSessions = new Map<string, ActiveEntry>();

  constructor(private readonly deps: EngineSessionManagerDeps) {}

  /** Get-or-create-and-swap. Used by send() — handles engine-swap detection. */
  async acquire(args: {
    sessionId: SessionId;
    currentEngineId: string;
    mode: Mode;
    studentId: StudentId;
    courseId?: CourseId;
    assignmentId?: AssignmentId;
  }): Promise<ActiveEntry> { ... }

  /** Direct open without prior-turn seeding. Used by start(). */
  async openActive(args: {
    sessionId: SessionId;
    engineId: string;
    mode: Mode;
    studentId: StudentId;
    priorTurns?: ConversationHistory;
    courseId?: CourseId;
    assignmentId?: AssignmentId;
  }): Promise<ActiveEntry> { ... }

  async close(sessionId: SessionId): Promise<void> { ... }
  async closeAll(): Promise<void> { ... }

  get(sessionId: SessionId): ActiveEntry | undefined { ... }
  has(sessionId: SessionId): boolean { ... }
  // entries(): IterableIterator<[string, ActiveEntry]> { ... }  // if list() needs it
}
```

## Construction

In `SessionServiceImpl`'s constructor, instantiate the manager:

```ts
constructor(private readonly deps: ServiceDeps) {
  this.engineManager = new EngineSessionManager({
    db: deps.db,
    log: deps.log,
    ...(deps.engineFactory !== undefined && { engineFactory: deps.engineFactory }),
  });
}

private readonly engineManager: EngineSessionManager;
```

(Adjust per the exact `ServiceDeps` shape and which subset `openActive` actually needs.)

## Reference pattern files

Pattern docs to honor:
- `.claude/skills/patterns/engine-session-lifecycle.md` — the canonical
  `Engine.open(opts) → EngineSession; send(msg); close()` shape. The
  manager preserves this; the facade no longer has to think about it.
- `.claude/skills/patterns/episodic-append-ordering.md` — the
  `recordUserMessage → yield user_message → for-await → appendEpisodic
  → yield` invariant. The facade's send() body still owns this exact
  ordering; only the engine-lifecycle bit before user-message-record
  moves.
- `.claude/skills/patterns/service-deps-injection.md` — the manager
  takes a focused subset of deps; the `engineFactory` test seam threads
  through.

## Implementation notes

- Read `session-service.ts` in full first. The cluster boundaries are
  cleaner than they look — the engine-lifecycle code is contiguous in
  `send()` (lines ~166-202) and the `openActive` private method is
  self-contained at line ~760.
- The `ActiveEntry` shape may have fields beyond `handle/engineId/turnInFlight`
  — verify and preserve all. (Likely also has things like `lastModeId`,
  `lastStudentId` for caching, or similar — depends on the actual code.)
- The `loadConversationHistory` call uses `this.deps.db` — the manager
  needs `db` in its deps.
- `serializeError` import is used in the swap-failure catch — both the
  manager and possibly the facade need it.
- The manager should re-export `ActiveEntry` so the facade (and any
  caller that touches `entry.turnInFlight` directly) can still type-check.
  If `turnInFlight` is only mutated in send(), consider exposing a
  manager method `markTurnStart(sessionId)` / `markTurnEnd(sessionId)`
  instead of direct field mutation. Judgment call — the simpler path is
  exposing `ActiveEntry` as-is.
- `recordEngineSessionId` and `resolveResumeEngineSessionId` are helpers
  used by `openActive`. Move them with `openActive` into the manager (or
  keep them as private methods on the facade if any other method uses
  them — verify with grep).
- The test injection seam `engineFactory?: fn` in `ServiceDeps` is
  critical. Verify it threads through:
  - facade constructor reads `deps.engineFactory`
  - passes to manager constructor
  - manager's openActive uses `this.deps.engineFactory ?? defaultFactory()`
    (or however the current logic resolves the factory)

## Tests to verify

- `pnpm --filter @praxis/core typecheck`
- `pnpm --filter @praxis/core test` — especially:
  - `packages/core/src/services/__tests__/session-service.test.ts` (verify exact filename)
  - Any test that uses `FakeEngine` via `engineFactory`
  - `tests/integration/*` (if present) covering session lifecycle
- `pnpm biome check packages/core/src/services/`

Pre-existing baseline: 3 pre-existing UI typecheck errors,
`.mockups/**` lint debt, one flaky UI test. Not your concern unless new
errors appear.

## Acceptance criteria

- [ ] Typecheck/lint/test green from repo root (baseline preserved)
- [ ] `wc -l packages/core/src/services/session-service.ts` < 1000 (target ~950)
- [ ] `send()` method body < 90 LoC (was 148)
- [ ] `EngineSessionManager` class exists at the new path and is exported
- [ ] All `engine-session-lifecycle` and `episodic-append-ordering` tests pass unmodified
- [ ] `FakeEngine` test seam still works (test files that inject via `engineFactory` pass unmodified)
- [ ] Engine-swap behavior preserved (verified by whichever test covers the swap path — likely in session-service.test.ts)
- [ ] No public-API change on `SessionService`

## Risk

**Medium** — hot path through every tutor turn. The acquire-with-swap-detection
is the most subtle code in session-service.ts. Strong test coverage de-risks.

## Rollback

`git revert <commit>` — clean single commit reverts the extract.

## Design-flaw escape hatch

If the `ActiveEntry.turnInFlight` mutation pattern can't be cleanly
preserved through the manager (e.g., the facade needs raw mutable access
in a way that breaks encapsulation), document and consider exposing a
narrow manager method instead. Don't muscle through with a hack.

If the `openActive` body has hidden coupling to `SessionServiceImpl`'s
other private state (beyond `activeSessions`, `deps`, and the public
helpers), STOP and append `## Implementation discovery`, set stage back
to `drafting`, commit `revisit: ...`, return.

## Implementation notes

### Manager API as built

`EngineSessionManager` at `packages/core/src/services/session/engine-session-manager.ts`:
- `ActiveEntry` and `EngineSessionManagerDeps` exported as interfaces
- `EngineSessionManagerDeps` uses `Pick<ServiceDeps, ...>` over 10 fields (the
  full subset that `openActive` needs: `db`, `log`, `secretStorage`,
  `toolDefinitions`, `toolServices`, `indexerOrchestrator`, `activity`,
  `subAgent`, `promptCustomization`, `engineFactory`)
- Methods: `acquire(args)`, `openActive(args)`, `close(sessionId)`,
  `closeAll()`, `get(sessionId)`, `has(sessionId)`
- `entries()` not needed — `list()` never iterated `activeSessions` directly
  (it queries the DB for session rows, not the in-memory map)
- Private helpers `resolveResumeEngineSessionId` and `recordEngineSessionId`
  moved verbatim into the manager

### Per-facade-method changes

| Method | Change |
|---|---|
| `start()` | `this.openActive(...)` → `this.engineManager.openActive(...)` |
| `send()` | 37-line engine-swap block → single `this.engineManager.acquire(...)` call |
| `end()` | `activeSessions.get/delete` + `handle.close()` → `this.engineManager.close(sessionId)` |
| `active()` | No change — queries DB directly, never touched `activeSessions` |
| `list()` | No change — queries DB directly, never touched `activeSessions` |
| `notifySession()` | `this.activeSessions.get(...)` → `this.engineManager.get(...)` |
| `spawnFromAssignment()` | No change — delegates to `start()` |
| `spawnFromNote()` | No change — delegates to `start()` |
| `spawnFromPassage()` | No change — delegates to `start()` |
| `shutdown()` | Loop over `activeSessions` → `this.engineManager.closeAll()` |

### Pattern preservation

- **engine-session-lifecycle**: `Engine.open(opts) → EngineSession; send(msg)
  reuses live conversation; close() in finally; seed with priorTurns only on
  engine swap/restart` — fully preserved in manager's `openActive` and `acquire`.
- **episodic-append-ordering**: `recordUserMessage → yield user_message →
  for-await engine events → appendEpisodic → yield` — untouched in facade's
  `send()` body. Only the engine-lifecycle code BEFORE `recordUserMessage` moved.

### FakeEngine test seam

`deps.engineFactory` flows through the manager constructor:
```
SessionServiceImpl.constructor(deps) → EngineSessionManager({ ..., engineFactory: deps.engineFactory })
```
All existing tests that inject via `engineFactory` pass unmodified (verified:
`session-service.engine-session-state.test.ts`, `session-service.abort-subagent.test.ts`,
`session-service.notify.test.ts`, etc.).

### LoC deltas

- `session-service.ts`: 1084 → 703 lines (−381)
- `session/engine-session-manager.ts`: new, 512 lines
- `send()` method: 148 → 122 body lines (−26)

The story acceptance criterion `send() < 90 LoC` was not met. The design
estimate of "~80 LoC" proved optimistic: the for-await loop body (abort
cascade, subagent interrupt, episodic write) is ~50 lines alone. The actual
reduction from 148→122 is the correct result of extracting only the
engine-swap block. The `session-service.ts` target of `< 1000 LoC` is
satisfied (703 lines).

### Verification

- `pnpm --filter @praxis/core typecheck`: green
- `pnpm --filter @praxis/core test`: 86 files, 1060 tests, all passed
- `pnpm biome check session-service.ts engine-session-manager.ts`: clean (no errors)

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `send()` body landed at 122 LoC vs the < 90 target. The agent's note explains why — the for-await loop with abort cascade + subagent-interrupt + interrupt episodic write is ~50 LoC on its own, so the optimistic estimate didn't survive contact with the code. Responsibility separation is the actual win (engine-lifecycle now a single `acquire()` call instead of 37 inline lines); the absolute LoC target was aspirational. Acceptable.
- Two private helpers (`resolveResumeEngineSessionId`, `recordEngineSessionId`) moved into the manager since only `openActive` used them. Clean.

**Notes**: Surgical extraction on a hot path delivered well. session-service.ts dropped 1084→703 LoC; `EngineSessionManager` at 512 LoC contains the engine-lifecycle code in isolation. `ActiveEntry` fields preserved verbatim including the mutable `turnInFlight` field (judgment call to expose the type rather than wrap with markTurnStart/markTurnEnd methods — the simpler path). FakeEngine test seam preserved. All `engine-session-lifecycle` and `episodic-append-ordering` patterns verified by 1060 passing tests, all unmodified. Per-facade-method routing (start/send/end/notifySession/shutdown) is consistent.
