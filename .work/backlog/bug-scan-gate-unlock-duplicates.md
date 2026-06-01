---
id: bug-scan-gate-unlock-duplicates
created: 2026-06-01
tags: [bug, data-layer]
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
