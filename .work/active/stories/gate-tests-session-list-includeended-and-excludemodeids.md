---
id: gate-tests-session-list-includeended-and-excludemodeids
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

# `includeEnded: false` combined with `excludeModeIds` not tested

## Priority
Medium

## Spec reference
Item: `story-session-list-exclude-modes`
Acceptance criterion: from `list()` contract — combined option
behavior. Predicates are now built as an array
`[studentId, ?isNull(endedAt), ?notInArray(modeId, ...)]` — the
multi-option compose path is uncovered.

## Gap type
missing test for valid combination (decision-table coverage)

## Suggested test
```ts
it("includeEnded:false + excludeModeIds combine: only open non-configure sessions", async () => {
  insertSession(db, { studentId, modeId: "teach", endedAt: new Date() });   // excluded by includeEnded:false
  insertSession(db, { studentId, modeId: "configure" });                     // excluded by excludeModeIds
  const survivor = insertSession(db, { studentId, modeId: "teach" });        // open + non-configure
  const svc = makeService(db);
  const results = await svc.list({ includeEnded: false, excludeModeIds: ["configure"] });
  expect(results.map(s => s.sessionId)).toEqual([survivor]);
});
```

## Test location (suggested)
`packages/core/src/services/__tests__/session-service.list.test.ts`
