---
id: gate-tests-session-active-studentid-isolation
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

## Implementation notes

Added two new test cases (8 and 9) to the existing
`packages/core/src/services/__tests__/session-service.active.test.ts` file:

- **Test 8** — inserts an open configure session for `"other-student"` only;
  asserts `active({ modeId: "configure" })` returns `null` for the runtime
  current student (isolation: no bleed-through when the current student has no
  sessions).

- **Test 9** — inserts open configure sessions for both `"other-student"` and
  the runtime current student; asserts `active()` returns the current student's
  own session ID and not the other student's.

The `active()` implementation in `session-service.ts` already correctly filters
by `studentId` via `getOrCreateDefaultStudentId` — isolation is confirmed
working. No design flaw found. All 1161 tests pass.
