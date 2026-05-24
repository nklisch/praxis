---
id: gate-tests-session-list-excludemodeids-studentid-isolation
kind: story
stage: implementing
tags: [testing, sessions]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
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
