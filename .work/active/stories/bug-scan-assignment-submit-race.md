---
id: bug-scan-assignment-submit-race
kind: story
stage: done
tags: [bug, data-layer, high]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: high
bug_domain: data-layer
bug_location: packages/core/src/services/assignment-service.ts:249
---

# Concurrent assignment submissions can both grade and overwrite

**Location**: `packages/core/src/services/assignment-service.ts:249` · **Severity**: high · **Pattern**: wrong isolation / check-then-update race across async work

Two submit calls can both observe `submittedAt` as null, both run grading, and both update the assignment, with last write winning and notifications firing twice. Atomically claim or finalize with `WHERE submitted_at IS NULL`, check changed-row count, and use an idempotency key for long grading work.

```ts
if (assignment.submittedAt) {
  throw new Error(`Assignment already submitted: ${input.assignmentId}`);
}
const grade: Grade = await this.orchestrator.gradeAssignment({ assignment, responses, mode });
this.deps.db.update(assignments).set({ submittedAt, gradeJson: grade }).where(eq(assignments.id, input.assignmentId)).run();
```

## Implementation notes

- Changed `packages/core/src/services/assignment-service.ts` so `submit()` atomically claims an unsubmitted assignment before async grading with `WHERE submitted_at IS NULL`; concurrent callers now fail before invoking the grader, and failed grading releases the claim for retry.
- Added regression coverage in `packages/core/src/__tests__/assignment-service.test.ts` proving a concurrent second submit does not trigger a second grade or overwrite the first result.

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Story fast lane. Verdict: Approve - story verified by implement; fast-lane advance. Full integration verification also passed with `TMPDIR=$PWD/.tmp pnpm test` (489 files, 5439 tests) and targeted Biome on the touched-code set.
