---
id: gate-tests-affective-indexer-transaction-atomicity
kind: story
stage: review
tags: [testing]
parent: feature-release-v0.1.0-test-findings
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

## Implementation notes
Added one test in a new `describe("AffectiveIndexer — transaction atomicity")` block in
`packages/core/src/services/indexers/__tests__/affective-indexer.test.ts`. Failure injection
technique: `vi.spyOn(db, "transaction").mockImplementationOnce(callback => realTransaction(tx
=> { vi.spyOn(tx, "insert").mockImplementation(...) }))` — spy on `db.transaction` to intercept
the `tx` context, then spy on `tx.insert` to throw on the second call. This exercises the real
SQLite transaction (`BEGIN/ROLLBACK`) so atomicity is genuinely tested, not simulated.
Constraint-violation injection was considered but rejected because uuidv7 IDs never collide;
a Drizzle middleware approach was considered but Drizzle ORM doesn't expose a middleware API
on the transaction object. The `mockImplementationOnce` ensures subsequent test cases get the
real `db.transaction` back without cleanup friction.
