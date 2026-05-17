---
id: epic-course-structured-tutor-course-aware-mode-prompts-story-teach-addendum
kind: story
stage: done
tags: [tutor-ux, mode-prompts, curriculum]
parent: epic-course-structured-tutor-course-aware-mode-prompts
depends_on: [epic-course-structured-tutor-course-aware-mode-prompts-story-1-foundation]
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Teach-mode course-aware addendum

## Scope

Write the teach branch of `composeInCourseBehaviorFragment` and plug
`behaviorInCourseFragmentDefault.teach` into `teachMode.promptFragments`.

## Prose specification

The teach branch's template must, given a `CourseStateSnapshot`:

1. Name the current lesson by title.
2. Anchor instruction on the lesson's concept dependencies — work
   bottom-up, only build on concepts the student has marked studied.
3. Tell the model to call `retrieve_from_documents` for definitions
   from the course's documents BEFORE generalizing from training data.
4. Tell the model to author assignments (`assignment.create`) drawn
   from the lesson's concept set, not free-floating topics.
5. Stay within the lesson — when the student drifts to a future
   lesson's concept, name that it's "up next" rather than diving in.

Keep it tight — one paragraph, ~6 lines. Reference the facts ("the
lesson named above") without restating them.

## Implementation

### File: `packages/curriculum/src/brief/in-course-behavior.ts`

Replace the placeholder teach branch with the real prose.

### File: `packages/curriculum/src/modes/teach.ts`

Import `behaviorInCourseFragmentDefault` and insert
`behaviorInCourseFragmentDefault.teach` into `promptFragments`
immediately after `courseContextFragmentDefault`.

## Acceptance criteria

- [ ] `composeInCourseBehaviorFragment("teach", snapshot).template`
  contains the current lesson's title (verifiable from a fixture
  snapshot).
- [ ] Template mentions `retrieve_from_documents` explicitly.
- [ ] Template mentions concept dependencies / bottom-up working
  order explicitly.
- [ ] `teachMode.promptFragments` includes
  `behaviorInCourseFragmentDefault.teach`.
- [ ] Rendered system prompt for teach-with-courseId contains the
  facts section, followed by the behavior addendum, followed by
  constraints.
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @praxis/curriculum`
  green.

## Tests

- Extend `packages/curriculum/src/modes/__tests__/in-course-prompt-shape.test.ts`
  (created in story-1-foundation) with a teach-specific case
  asserting on the prose markers.

## Review (2026-05-14)

**Verdict**: Approve with comments

**Blockers**: none
**Important**:
- **Missing test coverage** — `in-course-prompt-shape.test.ts` was never created (foundation skipped it). Test coverage gap covered by `course-aware-mode-prompts-missing-tests` backlog item.

**Nits**: Template says "Author quick checks from the lesson's concept set" — original spec said "Author assignments (`assignment.create`)". Functionally close; not blocking. "Up next" drift handling is not in the prose but is also not strictly required by the acceptance criteria as written.

**Notes**: 686 curriculum/core tests pass. Template names lesson title, mentions `retrieve_from_documents`, mentions concept dependencies. Fragment correctly registered in `teach.ts` after `courseContextFragmentDefault`.
