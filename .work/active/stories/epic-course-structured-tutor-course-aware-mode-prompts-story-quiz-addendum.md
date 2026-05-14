---
id: epic-course-structured-tutor-course-aware-mode-prompts-story-quiz-addendum
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

# Quiz-mode course-aware addendum

## Scope

Write the quiz branch of `composeInCourseBehaviorFragment` and plug
`behaviorInCourseFragmentDefault.quiz` into `quizMode.promptFragments`.

## Prose specification

The quiz branch's template must, given a `CourseStateSnapshot`:

1. Name the current lesson by title.
2. State that items administered in this session must draw ONLY
   from the lesson's concept set named in the facts above — no
   improvising out-of-scope items.
3. Tell the model to use the lesson's assessment plan (if present
   in the snapshot's lesson references) as the authoritative source
   for item shape and difficulty.
4. When narrating feedback, anchor wins/misses on specific concepts
   from the lesson — not generic "good job" / "review this".
5. Do not give hints during answering; clarifications only.

Keep it tight — one paragraph.

## Implementation

### File: `packages/curriculum/src/brief/in-course-behavior.ts`

Replace the placeholder quiz branch with the real prose.

### File: `packages/curriculum/src/modes/quiz.ts`

Import `behaviorInCourseFragmentDefault` and insert
`behaviorInCourseFragmentDefault.quiz` into `promptFragments`
immediately after `courseContextFragmentDefault`.

## Acceptance criteria

- [ ] `composeInCourseBehaviorFragment("quiz", snapshot).template`
  contains the current lesson's title.
- [ ] Template mentions "this lesson's concepts" or equivalent
  scope-locking language.
- [ ] Template names the lesson assessment plan as the source
  of item shape.
- [ ] `quizMode.promptFragments` includes
  `behaviorInCourseFragmentDefault.quiz`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @praxis/curriculum`
  green.

## Tests

- Extend `in-course-prompt-shape.test.ts` with a quiz-specific case
  asserting on the prose markers.
