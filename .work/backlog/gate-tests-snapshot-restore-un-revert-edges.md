---
id: gate-tests-snapshot-restore-un-revert-edges
kind: story
stage: backlog
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `restoreAction` un-revert path has only one happy-path test

## Priority
Low

## Spec reference
Item: `epic-backend-fills-for-redesign-snapshot-restore-capture-and-restore`

Acceptance criterion: feature body Unit 5 — "The new `restore` action itself
has a snapshot row, enabling un-revert." Existing coverage at
`snapshot-restore.test.ts:664` covers one un-revert flow ("restoring a
restore action re-applies the original mutation"). Edge cases not covered:
double-un-revert (re-revert after un-revert) and un-revert across an entity
that was later mutated by a different action (chain).

## Gap type
missing test for valid partitions

## Suggested test
```ts
it("un-revert is idempotent — restoring the same restore-action twice returns already_restored on second call", async () => { /* ... */ });
it("un-revert after an intermediate edit composes correctly (re-applies original-mutation state, not current state)", async () => { /* ... */ });
```

## Test location (suggested)
`packages/core/src/services/__tests__/snapshot-restore.test.ts`
