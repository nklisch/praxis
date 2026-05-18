---
id: epic-backend-fills-for-redesign-ui-completion-bundle
kind: feature
stage: drafting
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

<!-- The design pass will sequence the bundle's sub-items into
1-3-unit-each implementation stories and may recommend extracting any
that grow during design. -->
