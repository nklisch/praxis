---
id: gate-cruft-session-service-assignmentid-undefined-defensive
kind: story
stage: implementing
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
