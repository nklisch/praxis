---
id: epic-course-structured-tutor-course-aware-mode-prompts-story-exam-addendum
kind: story
stage: review
tags: [tutor-ux, mode-prompts, curriculum]
parent: epic-course-structured-tutor-course-aware-mode-prompts
depends_on: [epic-course-structured-tutor-course-aware-mode-prompts-story-1-foundation]
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Exam-mode course-aware addendum

## Scope

Write the exam branch of `composeInCourseBehaviorFragment` and plug
`behaviorInCourseFragmentDefault.exam` into `examMode.promptFragments`.

## Prose specification

The exam branch's template must, given a `CourseStateSnapshot`:

1. Name the current lesson/unit context.
2. State strictly: the model administers the assignment-bound items
   only. No off-scope content even if the student asks.
3. No teaching, no document retrieval, no coaching during the exam
   — this aligns with `examMode.toolNames` already excluding those
   tools but the prompt should reinforce.
4. Tell the model that `clarification` is the only acceptable
   response to confusion about an item — no methods or answers
   revealed.
5. After submission, narrate concept-level mastery against the
   lesson's concept set; defer remediation to subsequent teach
   sessions.

Keep the exam prose conservative — the existing exam role fragment
already enforces a verification stance; the addendum complements it
with course-specific scoping.

## Implementation

### File: `packages/curriculum/src/brief/in-course-behavior.ts`

Replace the placeholder exam branch with the real prose.

### File: `packages/curriculum/src/modes/exam.ts`

Insert `behaviorInCourseFragmentDefault.exam` into
`promptFragments` immediately after `courseContextFragmentDefault`.

## Acceptance criteria

- [ ] `composeInCourseBehaviorFragment("exam", snapshot).template`
  contains the current lesson's title.
- [ ] Template enforces "assignment-bound items only" scope.
- [ ] Template references `clarification` as the only acceptable
  response to confusion.
- [ ] `examMode.promptFragments` includes
  `behaviorInCourseFragmentDefault.exam`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @praxis/curriculum`
  green.

## Tests

- Extend `in-course-prompt-shape.test.ts` with an exam-specific case
  asserting the scope-locking language is present.
