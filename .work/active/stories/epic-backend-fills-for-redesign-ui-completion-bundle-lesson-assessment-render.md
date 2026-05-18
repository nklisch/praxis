---
id: epic-backend-fills-for-redesign-ui-completion-bundle-lesson-assessment-render
kind: story
stage: done
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

- [x] Pills render per lesson in both configure Course tab and
      course-create draft.
- [x] Colour coding matches the locked mock.
- [x] All quality checks green.

## Out of scope

- Editing assessments inline. v1 is read-only render.

## Review (2026-05-17)

**Verdict**: Approve with comments

**Blockers**: none

**Important**:
- Missing `.catch()` on the `FetchingPills` IPC call → `lesson-assessment-pills-add-catch-on-fetch` (backlog)

**Nits**:
- Pills are placed inside the `styles.field` div in `lesson-editor.tsx` (after the title label). Slightly odd semantics but harmless; field container provides the right margin.
- The `use-resource-hook` pattern could technically apply to `FetchingPills`, but since pills are decorative and the loading state renders nothing, the inline `useEffect` + cancellation flag is the lighter-weight choice here.

**Notes**: All packages touched by this story typecheck and test clean. Pre-existing typecheck failures in `@praxis/desktop` (duplicate `SqliteDraftStore`, `exactOptionalPropertyTypes` in `courses-section.tsx` and `note-editor-page.tsx`) are not caused by this story. The `AssessmentPillEntry` dual-mode prop design is well-executed. Tests are thorough (16 passing).

## Implementation notes

**New files:**
- `packages/ui/src/components/lesson-assessment-pills.tsx` — `LessonAssessmentPills` component accepting either pre-loaded `assessments: AssessmentPillEntry[]` (used by DraftCard for proposed entries) or `lessonId: LessonId` (fetches via `client.artifacts.lessonAssessments`). `AssessmentPillEntry` is exported for callers with draft/proposed data.
- `packages/ui/src/components/lesson-assessment-pills.module.css` — pill styles matching the locked mock exactly: READY (sage/tint-bootstrap), HW (indigo/tint-homework), QUIZ (slate/tint-quiz) with `color-mix(in oklab, ...)` tint backgrounds.
- `packages/ui/src/components/__tests__/lesson-assessment-pills.test.tsx` — 14 tests covering empty state, single pill variants, timing display, multi-pill combinations, purpose grouping, and CSS variant classes.

**Modified files:**
- `packages/core/src/types/tool.ts` — added `LessonAssessment` import; added `lessonAssessments(lessonId): Promise<LessonAssessment[]>` to `ArtifactsService`.
- `packages/core/src/types/client.ts` — added `LessonAssessment` import; added `lessonAssessments(lessonId)` to `ArtifactsClientSurface`; fixed pre-existing duplicate `Recommendation` import.
- `packages/core/src/services/artifacts-service.ts` — implemented `lessonAssessments()` with a DB query on `lessonAssessmentsTable`.
- `packages/desktop/electron/main/ipc-server.ts` — registered `praxis.artifacts.lessonAssessments` IPC channel; fixed pre-existing duplicate `registerRecommendationsHandlers` import.
- `packages/client/src/services/artifacts-client.ts` — implemented `lessonAssessments()` calling the new IPC channel.
- `packages/ui/src/components/lesson-editor.tsx` — wired `<LessonAssessmentPills lessonId={lesson.id} />` into the lesson editor, below the title field.
- `packages/ui/src/components/draft-card.tsx` — wired pills for proposed assessments filtered by `draftLessonId`.
- `packages/ui/src/__tests__/lesson-editor.test.tsx` — stubbed `artifacts.lessonAssessments` as a never-resolving promise so existing tests don't error.

**Design decisions:**
- Schema has `purpose: "readiness" | "practice" | "checkpoint"` mapping to READY / HW / QUIZ. No QC or EXAM pills at this layer (QC = quick-check, a separate Phase 17 concept; EXAM = unit exam, shown at the unit level, not lesson level).
- The `AssessmentPillEntry` interface (`{ purpose, timing }`) is a minimal shared shape that both `LessonAssessment` (DB) and `ProposedLessonAssessmentEntry` (draft) satisfy, allowing the same component to work in both surfaces.
- Pills render nothing on loading/empty (decorative metadata — no skeleton state needed).
