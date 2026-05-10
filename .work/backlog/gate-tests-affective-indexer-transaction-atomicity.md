---
id: gate-tests-affective-indexer-transaction-atomicity
kind: story
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: tests
created: 2026-05-10
updated: 2026-05-10
---

# Affective indexer transaction atomicity (rollback on mid-batch failure) not asserted

## Priority
Low

## Spec reference
Item: `epic-phase-18-affective-memory-indexer`
Acceptance criterion: "Transaction atomicity: a write failure mid-batch
rolls back the whole pass" (Unit 2 acceptance)

## Gap type
Adversarial-spec-silent — failure-mode invariant

## Suggested test

```ts
// Append to packages/core/src/services/indexers/__tests__/affective-indexer.test.ts
it("rollback on mid-batch write failure: no rows persist if any insert throws", async () => {
  // Use a real DB; stub the affective_samples insert to throw on the second
  // row (e.g. via a Drizzle middleware or by constraint-violating one row).
  // Assert: select count(*) === 0 after the indexer's run() rejects.
});
```

## Test location (suggested)
`packages/core/src/services/indexers/__tests__/affective-indexer.test.ts`

## Rationale
All mixed-path tests assume both writes succeed or the model fails before
any write. The all-or-nothing transaction property is unasserted. A
regression that drops the `db.transaction(() => { ... })` wrapper would
not be caught.
