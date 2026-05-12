---
id: gate-tests-ask-student-question-mode-toolnames
kind: story
stage: review
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `ask_student_question` membership in `configureMode.toolNames` / `bootstrapMode.toolNames` not asserted

## Priority
Medium

## Spec reference
Item: `epic-bootstrap-readiness-structured-questions` (Unit 3)
Acceptance criterion: "`configureMode.toolNames` includes `'ask_student_question'`" and "`bootstrapMode.toolNames` includes `'ask_student_question'`"

## Gap type
Missing test for valid partition

## Suggested test
```ts
// packages/curriculum/src/__tests__/configure-mode.test.ts — extend "configure mode toolNames" describe
it("includes ask_student_question", () => {
  expect(configureMode.toolNames).toContain("ask_student_question");
});

it("bootstrapMode.toolNames includes ask_student_question", () => {
  expect(bootstrapMode.toolNames).toContain("ask_student_question");
});
```

## Test location (suggested)
`packages/curriculum/src/__tests__/configure-mode.test.ts`

## Implementation notes

Both `configureMode` and `bootstrapMode` already included `ask_student_question` in their `toolNames` arrays — no mode-file changes were needed.

- `bootstrapMode.toolNames` assertion was already present in `packages/curriculum/src/modes/__tests__/bootstrap-toolnames.test.ts` (added as part of the "included tools" describe block).
- Added `configureMode.toolNames` assertion to the `"configure mode toolNames"` describe block in `packages/curriculum/src/__tests__/configure-mode.test.ts`.

All 369 curriculum tests pass; typecheck clean.
