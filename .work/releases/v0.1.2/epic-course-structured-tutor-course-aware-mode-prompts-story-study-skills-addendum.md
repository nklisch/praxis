---
id: epic-course-structured-tutor-course-aware-mode-prompts-story-study-skills-addendum
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

# Study-skills-mode course-aware addendum

## Scope

Write the study-skills branch of `composeInCourseBehaviorFragment`
and plug `behaviorInCourseFragmentDefault["study-skills"]` into
`studySkillsMode.promptFragments`.

## Prose specification

The study-skills branch's template must, given a
`CourseStateSnapshot`:

1. Name the current lesson by title.
2. Tell the model: techniques are general, but DEMONSTRATIONS in
   this session must use the current lesson's concepts and the
   course's available documents as the substrate.
3. For concept mapping: use the lesson's concept set as the
   starting nodes — don't ask the student to invent the map.
4. For Cornell / Feynman / spaced repetition: anchor demos on
   notes/flashcards the student will actually use for THIS lesson's
   material.
5. Reinforce: still one technique per session; the course context
   gives the practice substrate, it doesn't change the pacing.

## Implementation

### File: `packages/curriculum/src/brief/in-course-behavior.ts`

Replace the placeholder study-skills branch with the real prose.

### File: `packages/curriculum/src/modes/study-skills.ts`

Insert `behaviorInCourseFragmentDefault["study-skills"]` into
`promptFragments` immediately after `courseContextFragmentDefault`.

## Acceptance criteria

- [ ] `composeInCourseBehaviorFragment("study-skills", snapshot).template`
  contains the current lesson's title.
- [ ] Template explicitly directs demos onto the lesson's concepts
  and the course's available documents.
- [ ] Template preserves the "one technique per session" pacing
  rule from the existing study-skills role fragment.
- [ ] `studySkillsMode.promptFragments` includes
  `behaviorInCourseFragmentDefault["study-skills"]`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @praxis/curriculum`
  green.

## Tests

- Extend `in-course-prompt-shape.test.ts` with a study-skills-specific
  case.

## Review (2026-05-14)

**Verdict**: Approve with comments

**Blockers**: none
**Important**:
- **Missing test coverage** — covered by `course-aware-mode-prompts-missing-tests` backlog item.

**Nits**: Template doesn't explicitly preserve "one technique per session" pacing (criteria 3); that's already in the study-skills role fragment, so not a real loss.

**Notes**: 686 tests pass. Lesson title, demos-on-concepts, documents reference all present. Fragment correctly registered.
