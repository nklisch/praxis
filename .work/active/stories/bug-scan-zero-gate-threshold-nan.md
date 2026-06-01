---
id: bug-scan-zero-gate-threshold-nan
kind: story
stage: review
tags: [bug, time-numbers]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
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

## Implementation notes

- Changed `packages/curriculum/src/gates/criteria.ts` to compute ratio progress through a finite helper: zero-or-lower thresholds return `1` when the actual value meets the threshold, otherwise `0`.
- Added regression coverage in `packages/curriculum/src/gates/__tests__/criteria.test.ts` for zero-threshold mastery and submitted exam criteria, asserting progress is finite and complete.
- Verification: `TMPDIR=/home/nathan/dev/praxis/.tmp pnpm vitest run packages/curriculum/src/gates/__tests__/criteria.test.ts` passed.
