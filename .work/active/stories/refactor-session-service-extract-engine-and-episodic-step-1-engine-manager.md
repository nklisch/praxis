---
id: refactor-session-service-extract-engine-and-episodic-step-1-engine-manager
kind: story
stage: implementing
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
