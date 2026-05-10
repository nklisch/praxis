---
id: gate-cruft-dead-queries-persist-units-test
kind: story
stage: implementing
tags: [cleanup]
parent: feature-release-v0.1.0-cruft-findings
depends_on: []
release_binding: v0.1.0
gate_origin: cruft
created: 2026-05-10
updated: 2026-05-10
---

# Dead query `courseRow` and `rawCourse` in bootstrap-service.persist-units.test.ts

## Confidence
High

## Category
dead function

## Location
`packages/core/src/services/__tests__/bootstrap-service.persist-units.test.ts:178-183`

## Evidence

```ts
// We already verified courseUnits; check assessmentPlanJson via direct sql.
const courseRow = db
  .select({ apj: courseUnits.id }) // indirect: just check via courses table below
  .from(courseUnits)
  .all();
// We already verified courseUnits; check assessmentPlanJson via direct sql.
const rawCourse = db.run(`SELECT assessment_plan_json FROM courses WHERE id = '${courseId}'`);
// better-sqlite3 run() returns { changes, lastInsertRowid }; use get() instead
const courseData = db.get<{ assessment_plan_json: string }>(...);
```

Both `courseRow` and `rawCourse` are declared but never asserted on; the
comment on line 184 even confirms `rawCourse` was wrong (`run()` doesn't
return rows). All actual assertions use `courseData`. Biome flagged both
as `noUnusedVariables`.

## Removal

- Delete lines 177-184 (the `// Verify courses.assessment_plan_json is
  written.` block, the `courseRow` query, the second redundant comment,
  the `rawCourse` line, and the `// better-sqlite3 run()...` comment).
- Keep line 185 onwards starting with `const courseData = db.get<...>`.
- Optionally restore a single comment above `courseData` ("Verify
  courses.assessment_plan_json is written.") so the assertion intent
  isn't lost.
