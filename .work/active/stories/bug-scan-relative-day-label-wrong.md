---
id: bug-scan-relative-day-label-wrong
kind: story
stage: implementing
tags: [bug, time-numbers]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: low
bug_domain: time-numbers
bug_location: packages/ui/src/routes/progress.tsx:39
---

# Relative day labels mark late-yesterday events as today

**Location**: `packages/ui/src/routes/progress.tsx:39` · **Severity**: low · **Pattern**: calendar arithmetic with fixed 86400000 ms days

Subtracting event time from local midnight and flooring by a fixed day length labels late-yesterday events as today near midnight and mishandles DST boundaries. Compare local calendar dates or normalize both timestamps to local midnight before subtracting.

```ts
const diffDays = Math.floor((startOfToday.getTime() - atMs) / DAY);
if (diffDays <= 0) return "today";
if (diffDays === 1) return "yesterday";
```
