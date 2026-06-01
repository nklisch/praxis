---
id: bug-scan-zero-gate-threshold-nan
created: 2026-06-01
tags: [bug, time-numbers]
bug_origin: scan
bug_severity: medium
bug_domain: time-numbers
bug_location: packages/curriculum/src/gates/criteria.ts:71
---

# Valid zero gate thresholds can produce NaN progress

**Location**: `packages/curriculum/src/gates/criteria.ts:71` · **Severity**: medium · **Pattern**: division by zero / NaN propagation

The authoring schema permits `minScore: 0`, and `0 / 0` in gate progress yields `NaN`, which can propagate through parent gate criteria and UI percentages. Reject zero thresholds for ratio-based gates or special-case zero as a finite progress value.

```ts
const progress = Math.min(1, minScore / c.minScore);
// ...
const progress = Math.min(1, grade.total / c.minScore);
```
