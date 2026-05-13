---
id: epic-course-structured-tutor
kind: epic
stage: drafting
tags: [tutor-ux, curriculum, bootstrap, mode-prompts]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Course-structured tutor — let the curriculum drive the tutor, not the other way around

## Brief

Praxis ships with rich course structure — units, lessons, gates, concept
maps, assignment plans, ingested documents — and yet the tutor's mode
prompts still read as if the course doesn't exist. A teach session today
follows generic-tutoring patterns: explain, check, repeat. It doesn't
anchor on the current lesson, doesn't draw verification material from the
lesson's assessment plan, doesn't query the course's ingested documents
before generalizing. The course is a passive container the tutor sits
inside, not the guide rail the tutor follows.

This epic addresses two related gaps. **First**, the tutor surface
itself: the bootstrap explorer / course-creation flow has weak progress
signals (the displayed ETA is consistently too low, leaving users
staring at a stalled-looking UI), and there's no way for the course
creator to enumerate in-progress drafts — they're only addressable by an
opaque `draftId` from a prior call, which makes session continuity a
guessing game. **Second**, the mode prompts: today's teach / quiz /
homework / exam / study-skills prompts are written for the case where
there's no course at all. We need a course-aware prompt variant that
treats the active course as its guiding light.

Together these are the productization move from "tutoring framework" to
"tutoring framework that actually uses the curriculum it just helped
you build."

## Scope absorbed from backlog

Three ideas in `.work/backlog/`:

- `idea-list-in-progress-drafts-tool` — add a `course.list_drafts` tool
  (and matching UI affordance, probably a "Resume draft" picker on the
  create-course screen) so course-creation conversations are resumable
  by name, not by pasted UUID.
- `idea-course-buildout-time-estimate` — replace the fixed-time ETA in
  the bootstrap explorer with structural progress signals (units
  processed, lessons drafted, current step). A misleading low ETA
  erodes trust faster than no ETA.
- `idea-mode-prompts-course-structure-aligned` — write course-aware
  variants of the mode prompts (teach, quiz, homework, exam,
  study-skills) that anchor on current lesson, draw from the lesson's
  assessment plan, and query the course's documents before
  generalizing. Keep the existing free-form prompts as the
  no-course fallback.

## Anchors (current implementation)

- Bootstrap explorer service — `packages/core/src/services/bootstrap-service.ts`
  + the `BootstrapTabBody` UI shell.
- Course draft store — `packages/core/src/db/` (drafts table + accessor).
- Bootstrap tools — `course.start_exploration`, `course.draft_add_unit`,
  `course.draft_set_assessment_plan`, `course.draft_add_lesson_assessment`
  in `@praxis/tools/course`.
- Activity rail (ETA surface) — `<ActivityRail />` mounted in
  `router.tsx`; producers inject `ActivityRegistry` via
  `ServiceDeps.activity`. Pattern: `activity-rail-producer`.
- Mode prompt fragments — `packages/curriculum/src/modes/` plus the
  `mode-prompt-fragment-composition` pattern (`composeSystemPrompt`,
  `FRAGMENT_ORDER`).
- Course / lesson / assessment-plan types — `packages/artifacts/src/`.
- Mode tool scoping — `mode-tool-scoping` pattern (mode.toolNames filters
  ServiceDeps.toolDefinitions in `SessionServiceImpl.openActive`).

## Why now

The v0.1.1 ship landed the bootstrap explorer, structured questions,
gates, the knowledge graph, and pedagogy pack composition. Every
ingredient for a curriculum-aware tutor is in the box; we just haven't
wired the tutor to consume them. This is the lowest-cost, highest-impact
"sharpen what already exists" move on the table right now — no new
foundation work, mostly authoring + tool surface.

The bootstrap-progress fix is the smallest of the three but unlocks
better UX during the very flow that ships every new user's first
course. Worth doing alongside the structural work.

## Decomposition direction (for epic-design)

Likely splits into 3 child features matching the absorbed ideas:

- **Bootstrap progress + draft resumption** — combine
  `list-drafts-tool` + `course-buildout-time-estimate` into one
  feature. They share the bootstrap surface, the draft store, and the
  activity-rail integration.
- **Course-aware mode prompts** — `mode-prompts-course-structure-aligned`
  is its own arc; design needs to decide whether it's per-mode
  fragments (one new fragment shared across teach/quiz/homework that
  injects course context) or whole replacement variants of each mode.
- **(Possibly) Resume-draft picker UI** — if the picker is more than a
  thin wrapper around the list-drafts tool, it justifies its own
  feature; otherwise it folds into the bootstrap feature above.

## Decomposition risks

- **Course-aware mode prompts may need a course-context fragment, not a
  whole new prompt** — duplicating teach / quiz / homework / exam /
  study-skills into "no-course" and "in-course" variants doubles the
  prompt-maintenance surface. Design should consider a single shared
  fragment that's customizable=false and only inserted when
  `session.courseId != null`.
- **Draft listing tool surface needs identity discipline** — drafts
  aren't currently first-class artifacts visible in the library;
  surfacing them changes the mental model of "what's a course." Decide
  whether drafts have their own list view or live inside the
  course-creation flow only.
- **Activity-rail integration for bootstrap may already be partial** —
  `ServiceDeps.activity` exists; check whether the bootstrap service
  already calls `ctx.activity?.start(...)` and just produces a bad
  estimate, vs. doesn't integrate at all. Different design responses.
- **The `course.list_drafts` tool is only useful in bootstrap mode** —
  enforce via `mode.toolNames` so it doesn't leak into teach / quiz /
  exam contexts.
