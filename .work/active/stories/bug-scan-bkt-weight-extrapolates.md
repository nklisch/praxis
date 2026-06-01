---
id: bug-scan-bkt-weight-extrapolates
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
bug_location: packages/core/src/services/memory/bkt.ts:118
---

# BKT exam weights linearly extrapolate and clamp instead of applying repeated Bayesian updates

**Location**: `packages/core/src/services/memory/bkt.ts:118` · **Severity**: medium · **Pattern**: BKT probability math / weighted probability update

The comment says integer weights behave like repeated updates, but the implementation extrapolates a single update and clamps, which can understate low priors and force mid/high priors to exactly `1`. Apply updates repeatedly for integer weights and only blend fractional remainders, or redefine the weighting model with tests.

```ts
case "exam_pass":
  return { correct: true, weight: 2 };
// ...
const blended = clamp01(pKnown + (updated - pKnown) * weight);
```

## Implementation notes

- Changed `packages/core/src/services/memory/bkt.ts` so integer weights apply repeated Bayesian updates and fractional remainders blend toward one additional update; probabilities are clamped/finite-checked at the helper boundary.
- Added regression coverage in `packages/core/src/services/memory/__tests__/bkt.test.ts` for exam weight parity with two repeated correct updates and finite bounded output.
