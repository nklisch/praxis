---
id: gate-tests-draft-store-rapid-save-ordering
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-12
updated: 2026-05-17
---

# SqliteDraftStore rapid back-to-back save() ordering not adversarially tested

## Priority
Low

## Spec reference
Item: `epic-bootstrap-readiness-durable-drafts` (Risks: "SQLite handles last-writer-wins naturally, but if two processes ever write the same draft simultaneously one's mutation is lost.")
Acceptance criterion: Spec acknowledges single-process for v1; multi-process is out of scope. The single-process race window (save → load → save in fast cadence) is in scope.

## Gap type
adversarial-spec-silent

## Suggested test
```ts
// packages/core/src/__tests__/draft-store.test.ts
it("rapid back-to-back save() calls preserve the last-written state", () => {
  // Two save() calls in the same tick — second one wins; load() returns the second state.
  // Verify lastTouchedAt of the loaded state reflects the latest save.
});
```

## Test location (suggested)
`packages/core/src/__tests__/draft-store.test.ts`

## Implementation notes — Land mode

Test already shipped at the suggested location; orchestrator audit confirmed:

- `packages/core/src/__tests__/draft-store.test.ts:293` — `it("rapid back-to-back save() calls preserve the last-written state (single-process race window)")` covers exactly the scenario the gate suggested: two `save()` calls in the same tick with no await, asserts `load()` returns the second state, asserts `lastTouchedAt` reflects the second save, and additionally pins that `createdAt` is preserved from the first save (upsert never overwrites it).

Gate is fully closed — advance to review.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode closure. Citation verified — the test at line 293 of `draft-store.test.ts` exercises the rapid-save race window, pins last-writer-wins, and as a bonus asserts `createdAt` preservation across the upsert.
