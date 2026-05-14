---
id: epic-course-structured-tutor-course-aware-mode-prompts-story-homework-addendum
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

# Homework-mode course-aware addendum

## Scope

Write the homework branch of `composeInCourseBehaviorFragment` and
plug `behaviorInCourseFragmentDefault.homework` into
`homeworkMode.promptFragments`.

## Prose specification

The homework branch's template must, given a `CourseStateSnapshot`:

1. Name the current lesson by title.
2. State that items span the full set of the lesson's concepts —
   broader coverage than a quiz.
3. Tell the model not to hint or scaffold mid-attempt; the student
   works independently and submits as one unit.
4. Reference the available documents as a resource the student
   can consult themselves (the tutor doesn't lookup-and-paste).
5. After submission, narrate concept-level feedback (which concepts
   landed, which need revisiting) drawn from the lesson's concept
   set.

## Implementation

### File: `packages/curriculum/src/brief/in-course-behavior.ts`

Replace the placeholder homework branch with the real prose.

### File: `packages/curriculum/src/modes/homework.ts`

Insert `behaviorInCourseFragmentDefault.homework` into
`promptFragments` immediately after `courseContextFragmentDefault`.

## Acceptance criteria

- [ ] `composeInCourseBehaviorFragment("homework", snapshot).template`
  contains the current lesson's title.
- [ ] Template mentions "do not hint mid-attempt" or equivalent.
- [ ] Template directs concept-level feedback after submission.
- [ ] `homeworkMode.promptFragments` includes
  `behaviorInCourseFragmentDefault.homework`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @praxis/curriculum`
  green.

## Tests

- Extend `in-course-prompt-shape.test.ts` with a homework-specific case.
