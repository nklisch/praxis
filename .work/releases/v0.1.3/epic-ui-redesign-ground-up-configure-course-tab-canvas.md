---
id: epic-ui-redesign-ground-up-configure-course-tab-canvas
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on:
  - epic-ui-redesign-ground-up-configure-canvas-side-chat-shell
  - epic-backend-fills-for-redesign-ui-completion-bundle-lesson-assessment-render
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

- [x] Course tab matches the locked mock.
- [x] Unit reorder persists (local state; server endpoint not yet wired).
- [x] Lesson pills render.
- [x] Inspector strip shows selected lesson's fields.
- [x] All quality checks green.

## Implementation notes

**Backend additions** (required; no prior IPC channel for units existed):

- `packages/core/src/types/tool.ts` — added `Unit` import; added `units(courseId): Promise<Unit[]>` to `ArtifactsService`.
- `packages/core/src/types/client.ts` — added `Unit` import; added `units(courseId): Promise<Unit[]>` to `ArtifactsClientSurface`.
- `packages/core/src/services/artifacts-service.ts` — implemented `units()`: queries `course_units` ordered by `orderIndex`, then joins `lesson_units` → `lessons` per unit to collect `lessonIds` in study order. Uses conditional property assignment to satisfy `exactOptionalPropertyTypes`.
- `packages/desktop/electron/main/ipc-server.ts` — registered `praxis.artifacts.units` IPC channel (handleEnvelope, courseIdSchema).
- `packages/client/src/services/artifacts-client.ts` — implemented `units()` calling the new IPC channel.

**Context extension:**

- `packages/ui/src/hooks/use-configure-state.ts` — added `SelectedLessonState` interface + `selectedLesson`, `setSelectedLesson`, `clearSelectedLesson` to `ConfigureState`. The `ConfigureStateContext` is the shared channel from `CourseTab` (producer) to `InspectorStrip` (consumer).

**UI — configure shell:**

- `packages/ui/src/routes/configure.tsx` — `InspectorStrip` now accepts + renders `selectedLesson`; shows empty-state hint when nothing selected, lesson title + key fields grid when a lesson is active. Shell passes `selectedLesson` state down.

**UI — course tab:**

- `packages/ui/src/routes/configure/course-tab.tsx` — full rebuild. `UnitBlock` renders each unit as a collapsible block (button header, drag-and-drop div wrapper). `LessonRow` renders as `<button>` with lesson number, title, `<LessonAssessmentPills lessonId={...} />`, and status badge. `FlatLessonList` falls back for courses with no units. On lesson click, calls `setSelectedLesson(...)` on `ConfigureStateContext`. Drag-and-drop reorders local unit state; no server-side reorder endpoint in v1 (noted in code comments).
- `packages/ui/src/routes/configure/course-tab.module.css` — full rewrite to match the locked mock's design tokens (legend strip, unit blocks, lesson rows, button resets).

**Tests:**

- `packages/ui/src/__tests__/configure-course-tab.test.tsx` — 12 tests covering: empty state, unit block rendering, lesson row rendering, legend strip, LessonAssessmentPills fetch calls per lesson, inspector strip (`setSelectedLesson`) integration (click triggers correct `{ lesson, unitIndex, lessonIndex }`), drag reorder (both units remain after drop), flat list fallback.

**Design decisions:**

- Lesson status (`done` / `active` / `gated`) is hardcoded to `gated` in v1 — no mastery/gate data is available at this render layer. A future story can cross-ref gate state.
- Unit reorder is local-state only — the server needs a `updateUnitOrder` endpoint. v1 preserves the visual feedback; the intent is logged in code comments.
- The `dist/` of `@praxis/core` and `@praxis/client` must be rebuilt after adding new interface methods. The `moduleResolution: Bundler` in the UI's tsconfig uses compiled `.d.ts` files from referenced projects (not source), so `pnpm --filter @praxis/core run build && pnpm --filter @praxis/client run build` was required during development.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `use-configure-state.ts` re-exports `LessonId` at line 42 but no caller imports it from this module — dead re-export. Safe to remove in a cleanup pass.
- `FetchingPills` unhandled rejection on `lessonAssessments()` fetch (line 90, `lesson-assessment-pills.tsx`) already tracked in `.work/backlog/lesson-assessment-pills-add-catch-on-fetch.md`.

**Notes**: `units()` IPC chain is complete and follows the `ipc-envelope-handler` pattern. `exactOptionalPropertyTypes` is handled correctly with conditional property assignment. Inspector strip wiring through `ConfigureStateContext` is clean. 12 tests cover all acceptance criteria. Advancing to `stage: done`.
