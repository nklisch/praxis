---
id: gate-tests-session-list-excludemodeids-studentid-isolation
kind: story
stage: done
tags: [testing, sessions]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-24
---

# `session.list({ excludeModeIds })` student-scoping not regression-guarded

## Priority
Medium

## Spec reference
Item: `story-session-list-exclude-modes`
Acceptance criterion: implicit in `list()`'s "for the student"
baseline. The new `excludeModeIds` predicate composes via `and(...)`
with the studentId predicate; a future predicate refactor could
regress this without any test catching it.

## Gap type
missing test for valid partition (student isolation)

## Suggested test
```ts
it("excludeModeIds does not leak sessions from other students", async () => {
  insertSession(db, { studentId: "other-student", modeId: "teach" });
  const mineId = insertSession(db, { studentId, modeId: "teach" });
  const svc = makeService(db);
  const results = await svc.list({ excludeModeIds: ["configure"] });
  const ids = results.map(s => s.sessionId);
  expect(ids).toEqual([mineId]);
});
```

## Test location (suggested)
`packages/core/src/services/__tests__/session-service.list.test.ts`

## Implementation notes

Added test 6 ("excludeModeIds does not leak sessions from other students") to
`packages/core/src/services/__tests__/session-service.list.test.ts`.

The test inserts a "teach" session for `"other-student"` and a "teach" session
for the current student, then calls `svc.list({ excludeModeIds: ["configure"] })`
and asserts the result contains exactly the current student's session ID — no
leakage from the other student.

Isolation is confirmed correct: `list()` seeds `conditions` with
`eq(sessions.studentId, studentId)` before appending `notInArray(sessions.modeId, excludeModeIds)`,
so the `and(...)` always scopes to the current student. All 1162 tests pass.
