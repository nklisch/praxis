---
id: feature-refactor-session-service-spawn-extraction-step-2-spawn-from-assignment
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-session-service-spawn-extraction
depends_on: [feature-refactor-session-service-spawn-extraction-step-1-spawner-skeleton]
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Move `spawnFromAssignment` into `SessionSpawner`

## What
Move the body of `SessionServiceImpl.spawnFromAssignment` into
`SessionSpawner.spawnFromAssignment`. The method on `SessionServiceImpl` becomes
a one-line delegate: `return this.spawner.spawnFromAssignment(input)`.

## Why
`spawnFromAssignment` is the most self-contained of the three spawn methods: it
has no opening-turn injection and no documentScopes call, just DB validation +
`startSession` + `parentSessionId` update. Moving it first validates the seam
established in step 1 with minimal risk.

## Files touched
- `packages/core/src/services/session/session-spawner.ts` — add
  `spawnFromAssignment` method
- `packages/core/src/services/session-service.ts` — replace body of
  `spawnFromAssignment` with single delegate call
- `packages/core/src/services/__tests__/session-service.notify.test.ts` — no
  structural change needed; tests call via `svc.spawnFromAssignment(...)` on the
  `SessionServiceImpl` instance, which still works via the delegate

## Current state
`spawnFromAssignment` is ~55 lines inline in `SessionServiceImpl` (lines 599–652
of `session-service.ts`). It:
1. Resolves `studentId` via `getOrCreateDefaultStudentId`
2. Validates parent session exists and belongs to student
3. Loads assignment row; throws if missing
4. Derives `modeId` from `assignmentRow.kind`
5. Calls `this.start({ modeId, assignmentId, courseId, _persistImmediately: true })`
6. Updates session row to set `parentSessionId`
7. Returns `{ ...handle, parentSessionId }`

## Target state
All logic above lives in `SessionSpawner.spawnFromAssignment`. The deps needed:
- `deps.db` — for all DB queries/updates
- `deps.startSession` — replaces the `this.start(...)` call
- `deps.log` — not needed here (no warn calls in this method), but available
  from `SessionSpawnerDeps` for consistency

`SessionServiceImpl.spawnFromAssignment` becomes:
```ts
async spawnFromAssignment(input: {
  assignmentId: AssignmentId;
  parentSessionId: SessionId;
}): Promise<SessionHandle> {
  return this.spawner.spawnFromAssignment(input);
}
```

Imports moved from `session-service.ts` to `session-spawner.ts`:
- `assignments` from `@praxis/artifacts/schema`
- `sessions` from `@praxis/memory/schema`
- `eq` from `drizzle-orm`
- `getOrCreateDefaultStudentId` from `../student.js`
- `brandId` from `../../types/index.js` (already there for CourseId brand)

## Implementation notes
- The `sessions` table import is shared with `notifySession` and other methods
  in `session-service.ts` — it stays imported there too. No de-duplication needed.
- `assignments` table import can be removed from `session-service.ts` after this
  step if it's no longer used elsewhere — check before removing.
- The `parentSessionId` update (`db.update(sessions).set(...)`) moves into the
  spawner. The sessions schema already carries a `parentSessionId` column; no
  schema change needed.
- Parent-validation logic (rows 608–617 of current file) must be preserved
  verbatim — this is the "just shipped" validation the feature constraint
  references.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` all green.
- `session-service.notify.test.ts` `describe("SessionServiceImpl.spawnFromAssignment")` block passes.
- No logic change — pure move. If any test fails, it's a sign something was
  missed in the move.

## Rollback
Revert `session-spawner.ts` additions; restore original body in `session-service.ts`.

## Implementation notes

- Moved `spawnFromAssignment` body verbatim (~55 lines) from `SessionServiceImpl` into `SessionSpawner.spawnFromAssignment`. `this.start(...)` became `this.deps.startSession(...)`.
- Added imports to `session-spawner.ts`: `assignments` from `@praxis/artifacts/schema`, `sessions` from `@praxis/memory/schema`, `eq` from `drizzle-orm`, `brandId` from `../../types/index.js`, `getOrCreateDefaultStudentId` from `../student.js`.
- Removed `assignments` from the `@praxis/artifacts/schema` import in `session-service.ts` — no longer used there. `sessions` import remains (used by `notifySession`, `send`, `end`, etc.).
- `SessionServiceImpl.spawnFromAssignment` is now a one-line delegate: `return this.spawner.spawnFromAssignment(input);`.
- Parent-validation logic (check parent row exists + belongs to student) preserved verbatim.
- All 96 core test files (1164 tests) passed, including `session-service.notify.test.ts` and the e2e `empty-session-cleanup-e2e.test.ts`.
