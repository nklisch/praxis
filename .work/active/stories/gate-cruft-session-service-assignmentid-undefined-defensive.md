---
id: gate-cruft-session-service-assignmentid-undefined-defensive
kind: story
stage: review
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: cruft
created: 2026-05-23
updated: 2026-05-23
---

# Defensive `assignmentId !== null && !== undefined` checks on non-nullable-undefined columns

## Confidence
Medium

## Category
defensive bloat (compatibility shim)

## Location
`packages/core/src/services/session-service.ts:291-294`,
`:467-470`, `:527-534`

## Evidence
```ts
...(sessionRow.assignmentId !== null &&
  sessionRow.assignmentId !== undefined && {
    assignmentId: brandId<"AssignmentId">(sessionRow.assignmentId),
  }),
```

And in `list()` the same pattern is applied to both `courseId` and
`assignmentId`:
```ts
...(row.courseId !== null &&
  row.courseId !== undefined && {
    courseId: brandId<"CourseId">(row.courseId),
  }),
```

## Verification
The Drizzle schema (`packages/memory/src/schema.ts:24, 26`) declares
both `courseId` and `assignmentId` as `text("...")` without `.notNull()`,
so the inferred row type is `string | null` — never `undefined`. Other
code paths in the same file (e.g. `start()` lines 288-290 for
`courseId`) use only `!== null` and TypeScript is happy. The
`!== undefined` arm is inconsistent and unreachable.

## Removal
Collapse each pair to a single `!== null` check (matching the existing
`courseId` style at line 288). Three call sites.

## Implementation notes

Three call sites collapsed in `packages/core/src/services/session-service.ts`:

1. **Line 266-269** (now 266-268) — `sessionRow.assignmentId !== null && sessionRow.assignmentId !== undefined` in `send()` / `acquire()` call → collapsed to `sessionRow.assignmentId !== null`.
2. **Line 441-444** (now 440-442) — `row.assignmentId !== null && row.assignmentId !== undefined` in `get()` return → collapsed to `row.assignmentId !== null`.
3. **Lines 501-508** (now 499-504) — both `row.courseId !== null && row.courseId !== undefined` and `row.assignmentId !== null && row.assignmentId !== undefined` in `list()` return → each collapsed to `!== null`.

TypeScript narrowed correctly in all three cases (no new errors). All 1159 tests pass.
