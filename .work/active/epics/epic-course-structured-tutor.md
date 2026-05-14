---
id: epic-course-structured-tutor
kind: epic
stage: review
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

## Decomposition

Split by capability arc. Draft resumption and buildout-progress signals
both touch the bootstrap surface but cover distinct user journeys —
"find your half-built course" (post-disconnect) vs. "watch your course
get built" (during the run). Bundling them would conflate the resume-
picker UI with the activity-rail integration, two different surfaces
that just happen to share a route neighborhood. Course-aware mode
prompts is its own arc — it touches the prompt composition pipeline
and the active session's mode/course context, not the bootstrap
surface at all. Three independent features, no shared types — runs in
one wave.

Anchor verification update: **the bootstrap service does NOT currently
inject `ActivityRegistry`** (per Phase-3 exploration), so the
buildout-progress feature is a fresh wiring rather than an
adjustment to an existing rail entry. The user-reported misleading
ETA lives somewhere outside `bootstrap-tab-body.tsx` — feature-design
must locate it.

### Child features

- `epic-course-structured-tutor-draft-resumption` —
  `course.list_drafts` tool + UI resume affordance — depends on: `[]`
- `epic-course-structured-tutor-buildout-progress` — replace
  misleading ETA with structural progress signals on the activity
  rail — depends on: `[]`
- `epic-course-structured-tutor-course-aware-mode-prompts` — shared
  customizable=false fragment that injects course context when
  `session.courseId != null` — depends on: `[]`

### Decomposition risks

- **Course-aware mode prompts may overreach during feature-design** —
  the "right" shape (one shared fragment vs. per-mode variants vs.
  course-context as a tool the tutor calls on demand) is genuinely
  uncertain. Feature-design should land the shape decision before
  writing fragments. The brief proposes the shared-fragment shape;
  feature-design may reject it.
- **Draft listing tool needs identity discipline** — drafts aren't
  currently first-class artifacts in the library. Surfacing them via
  a resume picker may bleed into the library mental model. Feature-
  design must decide whether drafts get their own list view or stay
  scoped to the create-course flow only.
- **Buildout-progress depends on locating the misleading ETA's
  source** — anchor verification couldn't find it in
  `bootstrap-tab-body.tsx`. Feature-design must reproduce the
  user-reported ETA before designing its replacement.
- **The `course.list_drafts` tool needs mode-tool-scoping enforcement**
  — it's only useful in bootstrap mode; must be gated via
  `mode.toolNames` so it doesn't leak into teach / quiz / exam
  contexts.
- **The course-context fragment depends on a stable course-lookup
  contract** — fetching the active course's structure at prompt-
  composition time needs an accessor that doesn't trigger N+1
  queries. Feature-design must verify the right accessor exists or
  add one.
