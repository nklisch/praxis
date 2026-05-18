---
id: epic-ui-redesign-ground-up-configure-course-tab-canvas
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on:
  - epic-ui-redesign-ground-up-configure-canvas-side-chat-shell
  - epic-backend-fills-for-redesign-ui-completion-bundle-lesson-assessment-render
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Configure Course tab canvas — unit/lesson tree + assessment pills

## Scope

Rebuild Course tab canvas per `tab-course.html`:
- Drag-reorderable unit blocks.
- Lessons nested under units with status badges (done / active / gated).
- `<LessonAssessmentPills>` from sibling story per lesson.
- Inspector strip shows selected lesson's editable fields with
  before/after.

## Implementation steps

1. Edit `packages/ui/src/routes/configure/course-tab.tsx`.
2. Replace existing layout with the new tree shape.
3. Use HTML5 drag-and-drop for unit reorder (persists via
   `praxisClient.authoring.updateCourse`).
4. Mount `<LessonAssessmentPills>` per lesson row.
5. Inspector strip integration — pass selected node to the shell's
   inspector strip.
6. Tests cover render + reorder + inspector wiring.
7. Quality checks green.

## Acceptance criteria

- [ ] Course tab matches the locked mock.
- [ ] Unit reorder persists.
- [ ] Lesson pills render.
- [ ] Inspector strip shows selected lesson's fields.
- [ ] All quality checks green.
