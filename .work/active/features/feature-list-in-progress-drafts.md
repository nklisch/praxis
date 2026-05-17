---
id: feature-list-in-progress-drafts
kind: feature
stage: drafting
tags: [tools, ui, bootstrap, configure]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-17
---

# Resume an in-progress course draft by name (list + picker)

## Brief

The course creator (bootstrap explorer mode) has no way to enumerate in-progress course drafts — drafts are only addressable by a `draftId` returned from a prior `course.start_exploration` call. If the user starts a new conversation, the only path back to a partially-built draft is pasting the raw id, which the student doesn't have. Add a `course.list_drafts` tool (or similar) that returns active drafts with id, title/metadata, last-modified, and progress signals (unit/lesson counts), so the creator can resume by name. Probably wants a UI surface too (a "Resume draft" picker on the create-course screen), but the tool is the substrate prerequisite.

## Scope

- A `course.list_drafts` tool (Zod schema + handler) in `packages/tools/src/course/` — modified per git status, foundation already partly in place.
- Tool returns: draft id, working title, created/updated timestamps, unit count, lesson count, current explorer step (if available).
- A UI surface — "Resume draft" picker — on the create-course screen so the creator can pick a draft by name instead of pasting an id.
- IPC channel wiring if the picker can't go through the tool dispatch path.

## Acceptance criteria

- `course.list_drafts` returns all in-progress drafts with the listed fields; empty list when there are none.
- The create-course screen surfaces a "Resume draft" picker populated by the tool.
- Selecting a draft from the picker resumes the bootstrap explorer at the saved state.
- Tests pin the tool's output shape and the picker's selection wiring.

## Anchors

- Existing tool partially-modified — `packages/tools/src/course/list-drafts.ts` (modified per git status)
- Bootstrap explorer entry — `packages/tools/src/course/start-exploration.ts`
- Draft store — `packages/core/src/` (`SqliteDraftStore`)
- UI create-course screen — `packages/ui/src/routes/courses.tsx` (modified per git status)
