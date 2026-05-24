---
id: feature-refactor-session-service-spawn-extraction-step-1-spawner-skeleton
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-session-service-spawn-extraction
depends_on: []
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Define `SessionSpawnerDeps` and create `SessionSpawner` skeleton

## What
Create `packages/core/src/services/session/session-spawner.ts` with the
`SessionSpawnerDeps` interface and an empty `SessionSpawner` class. Wire the
class into `SessionServiceImpl` (construct it in the constructor; expose it as a
private field). No methods move yet — this step only creates the seam and keeps
all tests green.

## Why
Establishes the file and interface so steps 2–4 can move methods one by one with
reviewable diffs. Mirrors how `session-promoter.ts` was introduced as a skeleton
before logic moved into it.

## Files touched
- `packages/core/src/services/session/session-spawner.ts` — new file
- `packages/core/src/services/session-service.ts` — construct `SessionSpawner`
  in constructor; store as `private readonly spawner: SessionSpawner`

## Current state
No `SessionSpawner` exists. All spawn logic is inline in `SessionServiceImpl`.

## Target state
`session-spawner.ts` exports:

```ts
export interface SessionSpawnerDeps {
  db: PraxisDb;
  log: Logger;
  /**
   * Port into SessionServiceImpl.start(). Used by all three spawnFrom* methods
   * to open the child session with _persistImmediately: true.
   */
  startSession: (opts: {
    modeId: string;
    courseId?: CourseId;
    assignmentId?: AssignmentId;
    _persistImmediately?: boolean;
  }) => Promise<SessionHandle>;
  /**
   * Port into SessionServiceImpl.send(). Used by spawnFromNote and
   * spawnFromPassage to inject an opening message before the student's first turn.
   */
  sendMessage: (sessionId: SessionId, message: string) => AsyncIterable<EngineEvent>;
  /** documentScopes service for passage-range attachment. */
  documentScopes: DocumentScopesService;
}

export class SessionSpawner {
  constructor(private readonly deps: SessionSpawnerDeps) {}
  // methods added in steps 2–4
}
```

`SessionServiceImpl` constructor:
```ts
this.spawner = new SessionSpawner({
  db: deps.db,
  log: deps.log,
  startSession: (opts) => this.start(opts),
  sendMessage: (sessionId, message) => this.send(sessionId as SessionId, message),
  documentScopes: deps.toolServices.documentScopes,
});
```

## Implementation notes
- `startSession` is a closure that captures `this` — identical pattern to
  `SessionPromoterDeps.persistSessionRow`.
- `sendMessage` wraps `this.send()` — the biome ignore comment that already
  exists on the inline cast moves with it (or can be dropped once the call site
  is inside the spawner class where `sessionId` is already typed).
- `DocumentScopesService` import type — already used in `session-service.ts`.
- No tests need to change in this step.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` all green.
- No new `any` without ignore comment.
- Public `SessionService` interface unchanged.

## Rollback
Delete `session-spawner.ts`; remove `this.spawner` field from `SessionServiceImpl`.
