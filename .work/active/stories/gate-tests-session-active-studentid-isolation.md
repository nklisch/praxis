---
id: gate-tests-session-active-studentid-isolation
kind: story
stage: drafting
tags: [testing, sessions]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# `session.active({ modeId })` cross-student isolation not regression-guarded

## Priority
Medium

## Spec reference
Item: `story-session-active-mode-filter`
Acceptance criteria (all scoped to "for the student") — but the WHERE
clause combines `studentId` AND `modeId`, and no test inserts sessions
belonging to a different `studentId` to confirm cross-student
bleed-through doesn't happen.

## Gap type
missing test for valid partition (multi-student isolation)

## Suggested test
```ts
it("ignores configure sessions belonging to a different student", async () => {
  insertSession(db, { studentId: "other-student", modeId: "configure" });
  const svc = makeService(db);
  const result = await svc.active({ modeId: "configure" });
  expect(result).toBeNull();
});
```

## Test location (suggested)
`packages/core/src/services/__tests__/session-service.active.test.ts`
