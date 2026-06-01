---
id: bug-scan-pasted-filename-utc-date
kind: story
stage: done
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
bug_location: packages/ui/src/routes/course-create.tsx:179
---

# Pasted-note filenames use the UTC date instead of the user's local date

**Location**: `packages/ui/src/routes/course-create.tsx:179` · **Severity**: low · **Pattern**: naive UTC/local Date mismatch

`toISOString()` converts to UTC before slicing, so evening local pastes in US time zones can be named with tomorrow's date. Format the local calendar date explicitly or use a date helper/Temporal-style local `PlainDate`.

```ts
const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const filename = `Pasted notes (${now}).txt`;
```

## Implementation notes

- Changed `packages/ui/src/routes/course-create.tsx` to format pasted-note filenames from local `Date` calendar fields instead of `toISOString()`.
- Exported the small formatter for focused regression coverage.
- Added regression coverage in `packages/ui/src/__tests__/course-create-route.test.tsx`.

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Story fast lane. Verdict: Approve - story verified by implement; fast-lane advance. Full integration verification also passed with `TMPDIR=$PWD/.tmp pnpm test` (489 files, 5439 tests) and targeted Biome on the touched-code set.
