---
id: bug-scan-gate-unlock-duplicates
kind: story
stage: review
tags: [bug, data-layer]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: medium
bug_domain: data-layer
bug_location: packages/core/src/services/gates-service.ts:113
---

# Concurrent gate evaluation can duplicate unlock events

**Location**: `packages/core/src/services/gates-service.ts:113` · **Severity**: medium · **Pattern**: missing row lock / non-idempotent state transition event

Gate evaluation reads state before the transaction, so two evaluators can both see a gate as locked and insert distinct unlock events. Make the transition conditional on the stored state still being locked and add a unique/idempotent key for student/course/gate unlock events.

```ts
const gatesList = await this.gates(input.courseId);
const result = await evaluator.evaluate({ studentId: input.studentId, gates: gatesList, /* ... */ });
return this.deps.db.transaction((tx) => {
  tx.insert(gateUnlockEvents).values({ id: uuidv7(), gateId: transition.gateId }).run();
});
```

## Implementation notes

- Changed `packages/core/src/services/gates-service.ts` so gate transitions re-check the stored gate state inside the write transaction before updating and only insert an unlock event when no event already exists for the same student/course/gate.
- Added regression coverage in `packages/core/src/__tests__/artifacts-service-gates.test.ts` for the existing-event dedupe path.
