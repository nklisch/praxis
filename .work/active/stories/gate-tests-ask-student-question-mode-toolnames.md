---
id: gate-tests-ask-student-question-mode-toolnames
kind: story
stage: implementing
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
