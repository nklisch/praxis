---
id: epic-course-structured-tutor-draft-resumption
kind: feature
stage: drafting
tags: [tutor-ux, bootstrap]
parent: epic-course-structured-tutor
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Draft resumption — list-drafts tool + resume picker

## Brief

A student in the bootstrap explorer can start designing a course, get
partway through, and then close the window. Today there's no path back:
drafts are only addressable by the opaque `draftId` returned from the
prior `course.start_exploration` call, and that id isn't surfaced
anywhere the student would have copied it. The only "resume" path is
pasting an id the student doesn't have — a dead end in practice.

This feature adds two paired surfaces. **First**, a new
`course.list_drafts` tool (mode-scoped to bootstrap) that returns active
drafts with id, title (or working name), last-modified timestamp, and
structural progress signals (unit count, lesson count, completion
percent — exact shape decided at feature-design). **Second**, a "Resume
draft" UI affordance on the create-course screen that consumes the tool
output and lets the student pick by recognizable metadata, not by UUID.

The tool is the substrate prerequisite — the UI consumes it. They land
in one feature because splitting introduces an artificial dependency
edge for what is conceptually one capability ("enumerate drafts to
resume one").

## Epic context

- Parent epic: `epic-course-structured-tutor`
- Position in epic: independent — touches bootstrap surface,
  course-drafts data, mode-tool scoping. Parallelizable with the
  other two features.

## Scope absorbed from backlog

- `idea-list-in-progress-drafts-tool` — `course.list_drafts` tool plus
  UI resume affordance on the create-course screen.

## Foundation references

- `docs/ARCHITECTURE.md` — bootstrap explorer, course drafts data model
- `docs/CURRICULUM.md` — course draft lifecycle
- `CLAUDE.md` — patterns `mode-tool-scoping`, `batch-tool-per-item-results`
  (if the listing tool returns many drafts)

## Anchors (current implementation)

- Bootstrap service —
  `packages/core/src/services/bootstrap-service.ts`
- Course-draft store — `packages/core/src/db/` (drafts table + accessor
  layer; identify the exact accessor at feature-design)
- Bootstrap tools —
  `packages/tools/src/course/` (existing tools:
  `course.start_exploration`, `course.draft_add_unit`,
  `course.draft_set_assessment_plan`,
  `course.draft_add_lesson_assessment`)
- Bootstrap UI — `packages/ui/src/components/bootstrap-tab-body.tsx`
- Bootstrap mode definition (toolNames allowlist) —
  `packages/curriculum/src/modes/bootstrap.ts` (or equivalent)
- Create-course entry point — wherever the "new course" flow starts in
  `packages/ui/src/routes/` — feature-design needs to locate this

## Pre-design decisions (2026-05-14)

- **Draft surfacing scope**: create-course flow ONLY. A "Resume
  in-progress draft" picker appears at the top of "New course"
  (or wherever the bootstrap flow begins). Library shows only
  finished courses — drafts are NOT first-class artifacts there.
  Cleaner mental model; avoids the "what is a draft when it has no
  course id yet" question bleeding into the library UI.
- **Tool scoping**: `course.list_drafts` is `bootstrap`-mode-only,
  enforced via `mode.toolNames`. Don't leak into teach / quiz /
  homework / exam contexts.
- **Resume picker shape**: dropdown-style picker at the entry point;
  list shows draft title (or working name), last-modified, and
  structural progress (unit / lesson counts). Feature-design picks
  the visual primitive (combobox vs. inline list) based on the
  editorial system.
