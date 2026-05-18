---
id: epic-backend-fills-for-redesign-ui-completion-bundle-lesson-assessment-render
kind: story
stage: implementing
tags: [ui]
parent: epic-backend-fills-for-redesign-ui-completion-bundle
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Lesson-assessment plan rendering — colour-coded pills

## Scope

UI-only. Surfaces the existing `lesson_assessments` rows
(timing × purpose) as colour-coded pills on each lesson card in the
configure Course tab and the course-create draft panel.

## Implementation steps

1. New `packages/ui/src/components/lesson-assessment-pills.{tsx,module.css}`:
   - Accepts an array of `LessonAssessment` rows for one lesson.
   - Renders pills grouped by `purpose` (e.g., qc / readiness /
     homework / quiz / exam) with timing badges.
   - Colour-codes per purpose using the locked palette tints.

2. Wire into the configure Course tab:
   - Edit the lesson row in the course tab component to import and
     render `<LessonAssessmentPills lessonId={lesson.id} />`.

3. Wire into the course-create draft panel:
   - Edit the draft lesson row similarly to render the pills.

4. Tests:
   - `lesson-assessment-pills.test.tsx` snapshot + purpose grouping.

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] Pills render per lesson in both configure Course tab and
      course-create draft.
- [ ] Colour coding matches the locked mock.
- [ ] All quality checks green.

## Out of scope

- Editing assessments inline. v1 is read-only render.
