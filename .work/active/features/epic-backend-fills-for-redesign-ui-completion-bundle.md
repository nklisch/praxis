---
id: epic-backend-fills-for-redesign-ui-completion-bundle
kind: feature
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# UI completion bundle

## Brief

A bundle of small UI/backend gaps that each surfaced in the locked
mocks but are individually too small to warrant their own feature.
Per user direction at scoping time, bundled together as one shipping
unit:

- **Theme preference persistence** — light / dark / auto toggle with
  `data-theme` override on `<html>`; persists user choice to local
  storage; respects `prefers-color-scheme` as default.
- **Library "+ Create a course" CTA** — adds a direct
  create-from-scratch button to the library Workbench; today "Use
  this pack" exists but no cold-start course-create entry.
- **Quiz confidence band per item** — captures the
  guessed / unsure / pretty-sure / certain signal per quiz response;
  feeds the procedural-memory indexer as a confidence signal.
- **Exam mode timer + auto-submit** — duration field on assignment;
  countdown UI in `ExamTabBody`; auto-submit at expiry; warn state
  in the last 5 minutes.
- **Lesson-assessment plan rendering** — UI render the existing
  `LessonAssessment` schema (timing × purpose) as colour-coded pills
  on each lesson in the configure Course tab and the course-create
  draft. Schema already complete (Phase 16); UI undersold it ("1
  check" badge); this fills it in.
- **`spawnFromNote(noteId, cueId?)`** — adds a session-spawn path
  parallel to `spawnFromAssignment`. Opens a teach session
  pre-loaded with a note's context; the tutor's opening turn quotes
  the note's unfinished cue. Companion of the note-to-tutor-brief
  flow.

Each item is small (likely 1-3 implementation units). Bundling
shares the release/review overhead.

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **independent** — no within-epic deps.
- UI co-ships with: various UI features
  (`epic-ui-redesign-ground-up-{app-shell, discovery-surfaces,
  chat-workspace, configure}`); each sub-item lands alongside its
  corresponding UI surface.

## Foundation references

- `packages/artifacts/src/schema.ts:117-150` — `lesson_assessments`
  table (timing × purpose) — schema complete; UI consumes
- `packages/core/src/services/session-service.ts:510+` —
  `spawnFromAssignment` is the template for `spawnFromNote`
- `.mockups/screens/.../-configure/tab-course.html` — lesson-plan
  rendering with assessment pills
- `.mockups/flows/note-to-tutor-brief/` — the spawn-from-note flow
- `.mockups/screens/.../-chat-workspace/mode-exam.html` — timer +
  auto-submit affordance
- `.mockups/screens/.../-chat-workspace/mode-quiz.html` —
  confidence-band UI

## Design decisions

- **One story per sub-item.** All six are independent; spawning six
  parallel stories under one feature gives the orchestrator maximum
  fan-out and produces clean per-item review surfaces.
- **No reorganization** — these are surgical extensions to existing
  surfaces. Keep changes contained to the file(s) each item touches.
- **`spawnFromNote` mirrors `spawnFromAssignment` exactly** for the
  shared spawn lifecycle. The opening-turn injection is the only
  novel bit.

## Architectural choice

Each sub-item is small and self-contained. They share no internal
contract, so the design is mostly per-story (see the story bodies).
This feature body documents the cross-cutting decisions and the
release-binding intent (one shipping unit covering all six).

## Sub-items (one story each)

1. **Theme persistence**
   `-theme-persistence`
   - `data-theme` toggle (auto / light / dark) bound to localStorage.
   - On mount, restore from storage; on toggle, write storage +
     update `<html>` attribute.
   - Tiny `useTheme()` hook; surface a toggle in the app shell
     status strip (already mocked).
   - Files: `packages/ui/src/hooks/use-theme.ts` (new),
     `packages/ui/src/components/theme-toggle.tsx` (new),
     `router.tsx` (wire toggle into shell).

2. **Library "+ Create a course" CTA**
   `-create-course-cta`
   - Adds a button to the library Workbench that opens the existing
     course-create flow.
   - Files: `packages/ui/src/routes/library.tsx` (or the relevant
     library component) — add CTA, wire to `praxisClient.bootstrap.startExploration`
     (the existing entry point) or the appropriate cold-start path.

3. **Quiz confidence band**
   `-quiz-confidence`
   - Schema: add `confidence` column to quiz response table
     (`"guessed" | "unsure" | "pretty_sure" | "certain"`, nullable).
   - UI: `QuizTabBody` renders the 4-button band below each item;
     stores selection per response.
   - Indexer: extend procedural-memory indexer to read the column.
   - Files: `packages/artifacts/src/schema.ts`, migration,
     `packages/ui/src/components/quiz-tab-body.{tsx,module.css}`,
     `packages/memory/src/indexers/procedural-indexer.ts`.

4. **Exam timer + auto-submit**
   `-exam-timer`
   - Schema: add `durationMinutes` column to `assignments` (nullable).
   - UI: `ExamTabBody` renders a countdown; turns warn (orange) in
     the last 5 minutes; auto-submits on expiry.
   - Files: `packages/artifacts/src/schema.ts`, migration,
     `packages/ui/src/components/exam-tab-body.tsx`.

5. **Lesson-assessment plan rendering**
   `-lesson-assessment-render`
   - UI-only. Renders the existing `lesson_assessments` rows
     (timing × purpose) as colour-coded pills on each lesson card
     in the configure Course tab + course-create draft.
   - Files: `packages/ui/src/components/lesson-assessment-pills.{tsx,module.css}`
     (new), import in configure Course tab and course-create draft
     panel.

6. **`spawnFromNote(noteId, cueId?)`**
   `-spawn-from-note`
   - New `SessionService.spawnFromNote({ studentId, noteId, cueId? })`:
     creates a teach session whose opening turn quotes the note's
     unfinished cue (and surrounding context if `cueId` provided).
   - Note-to-tutor-brief flow: the workspace note editor surfaces a
     "▶ talk to Praxis about this" button that calls the spawn.
   - Files: `packages/core/src/services/session-service.ts`,
     `packages/ui/src/components/note-editor-*.tsx` (add button to
     each note editor that supports cues — Feynman, Cornell).

## Implementation Order

Six parallel stories (no cross-deps between them). All begin from
`depends_on: []`.

## Acceptance Criteria

Per story; aggregate green = `pnpm typecheck && pnpm lint && pnpm test`
green across all six.

## Risks

- **Schema churn from #3 and #4 lands simultaneously**: two new
  columns on two different tables. No conflict, but the migration
  numbering needs to be sequential. Stories spawn migrations in
  any order; the implementation agents resolve numbering at apply
  time.
- **`spawnFromNote` injection format may drift from
  `spawnFromAssignment`**. Mitigation: read `spawnFromAssignment` as
  the template; mirror the opening-turn structure exactly.
