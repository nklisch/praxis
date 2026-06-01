---
id: bug-scan-matching-grader-over-100
created: 2026-06-01
tags: [bug, time-numbers]
bug_origin: scan
bug_severity: medium
bug_domain: time-numbers
bug_location: packages/core/src/services/graders/matching-grader.ts:57
---

# Matching grader can award scores above 100 percent for duplicate correct pairs

**Location**: `packages/core/src/services/graders/matching-grader.ts:57` · **Severity**: medium · **Pattern**: grade score normalization / duplicate-counting arithmetic

The grader counts every submitted pair instead of the unique intersection with the answer key, so duplicate correct pairs can produce item scores greater than `1`. Validate unique submitted pairs, score using a submitted-pair set, and clamp deterministic item scores to `[0, 1]`.

```ts
const correctSet = new Set(match.correctPairs.map((p) => `${p.leftId}|${p.rightId}`));
const correctCount = submittedPairs.filter((p) =>
  correctSet.has(`${p.leftId}|${p.rightId}`),
).length;
const score = correctCount / match.correctPairs.length;
```
