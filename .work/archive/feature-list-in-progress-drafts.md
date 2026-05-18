---
id: feature-list-in-progress-drafts
kind: feature
stage: done
tags: [tools, ui, bootstrap, configure]
parent: null
depends_on: []
release_binding: v0.1.3
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

## Design finding — Land mode

Audit confirmed every scope item already shipped:

- **Tool**: `packages/tools/src/course/list-drafts.ts:26` — `course.list_drafts` is a registered `ToolDefinition` returning `{ drafts: DraftListing[] }`. Each entry includes `draftId, title, subject?, gradeLevel?, unitCount, lessonCount, conceptCount, assessmentCount, completionPercent, createdAt, lastTouchedAt` — strictly broader than what the scope requested. Description text explicitly tells the model when to call it ("when the student says they want to resume a course they started"). Ordered DESC by `lastTouchedAt` per the BootstrapService contract.
- **Pure projection**: `toDraftListing(state: DraftCourseState): DraftListing` is co-located in the same file so the projection can be tested without DI.
- **UI picker**: `packages/ui/src/components/resume-draft-picker.tsx` — `ResumeDraftPicker` component with full keyboard navigation. Test coverage at `packages/ui/src/__tests__/resume-draft-picker.test.tsx` covers: button visibility (hidden when no drafts; shows count when present), listbox open/close behavior, row selection, keyboard nav, and `onResume(draft)` callback invocation.
- **Route integration**: The picker is mounted on `packages/ui/src/routes/courses.tsx` with `handleResumeDraft` wiring through to `client.session.send(handle.sessionId, ...)` for the resume action.
- **Service projection**: `services.bootstrap.listActiveForStudent(studentId)` (called by the tool's handler) is the underlying query, ordered DESC by `lastTouchedAt`.

Every acceptance criterion is met:
- ✅ `course.list_drafts` returns all in-progress drafts with the requested fields (and more); empty list when none exist (default zod output shape).
- ✅ Create-course screen surfaces a "Resume draft (N)" picker populated by the tool.
- ✅ Selecting a draft resumes the bootstrap explorer (via the `onResume` → `session.send` → engine path with the draft id).
- ✅ Tests pin both the tool's output shape and the picker's selection wiring.

## Review (2026-05-17)

**Verdict**: Approve (close as land-mode)

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Closed without code change. Every scope item already shipped — the tool, the UI picker, the route integration, and the test coverage. The original `idea-list-in-progress-drafts-tool` backlog item was a duplicate of work that had already landed by the time it was scoped.
