---
id: bug-scan-pasted-filename-utc-date
created: 2026-06-01
tags: [bug, time-numbers]
bug_origin: scan
bug_severity: low
bug_domain: time-numbers
bug_location: packages/ui/src/routes/course-create.tsx:179
---

# Pasted-note filenames use the UTC date instead of the user's local date

**Location**: `packages/ui/src/routes/course-create.tsx:179` · **Severity**: low · **Pattern**: naive UTC/local Date mismatch

`toISOString()` converts to UTC before slicing, so evening local pastes in US time zones can be named with tomorrow's date. Format the local calendar date explicitly or use a date helper/Temporal-style local `PlainDate`.

```ts
const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const filename = `Pasted notes (${now}).txt`;
```
