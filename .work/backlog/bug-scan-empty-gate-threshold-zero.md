---
id: bug-scan-empty-gate-threshold-zero
created: 2026-06-01
tags: [bug, time-numbers, high]
bug_origin: scan
bug_severity: high
bug_domain: time-numbers
bug_location: packages/ui/src/components/gate-inspector.tsx:103
---

# Empty gate-threshold edits silently save as a zero-percent mastery gate

**Location**: `packages/ui/src/components/gate-inspector.tsx:103` · **Severity**: high · **Pattern**: implicit numeric coercion / grade thresholds

Clearing the numeric input leaves an empty string, and `Number("") / 100` is `0`, so a normal edit can unintentionally make a mastery gate always pass. Treat empty input as invalid and validate finite range-bounded success criteria at the UI and persistence boundary.

```ts
const score = Number(minScore) / 100;
saveAction.trigger({
  gateId: gate.id,
  patch: { successCriteria: { ...gate.successCriteria, minScore: score } as SuccessCriteria },
});
```
