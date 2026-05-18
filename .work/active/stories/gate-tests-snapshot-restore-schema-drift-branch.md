---
id: gate-tests-snapshot-restore-schema-drift-branch
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `restoreAction` schema-drift branch is never tested

## Priority
High

## Spec reference
Item: `epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore`

Acceptance criterion: feature body Risks — "Schema evolution invalidates
snapshots... include a `schemaVersion` field; on restore, refuse with
`{ ok: false, reason: 'schema_drift' }` if the version doesn't match. Add
this in Story A."

The implementation honors this (`authoring-service.ts:506-508` returns
`{ ok: false, reason: "schema_drift" }` when
`payload.schemaVersion !== SNAPSHOT_SCHEMA_VERSION`), but no test exercises
the branch.

## Gap type
missing test for error case

## Suggested test
```ts
// packages/core/src/services/__tests__/snapshot-restore.test.ts
it("returns schema_drift when stored schemaVersion does not match current", async () => {
  db.insert(configuratorActions).values({ id: "a-1", kind: "course.edit", /* ... */ }).run();
  db.insert(configuratorSnapshots).values({
    actionId: "a-1",
    entityKind: "course",
    entityKeyJson: courseId,
    snapshotJson: { schemaVersion: 0, data: { /* old shape */ } },
    restoredAt: null,
  }).run();
  const result = await svc.restoreAction({ actionId: "a-1" });
  expect(result).toEqual({ ok: false, reason: "schema_drift" });
});
```

## Test location (suggested)
`packages/core/src/services/__tests__/snapshot-restore.test.ts`
