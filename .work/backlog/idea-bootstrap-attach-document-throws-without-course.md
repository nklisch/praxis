---
id: idea-bootstrap-attach-document-throws-without-course
kind: story
stage: drafting
tags: [bug, bootstrap]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# `course.attach_document` advertised in bootstrap mode but always throws (no courseId)

## Symptom

During a bootstrap session, the tutor called `course.attach_document` and the
chat rendered "Couldn't finish course attach document." The tutor then
rationalised the failure in text:

> The attach_document tool only works inside a course-scoped session, and we're
> still in bootstrap mode.

## Root cause

Mode declaration and tool implementation disagree about when this tool is
valid.

- `packages/curriculum/src/modes/bootstrap.ts:39` lists
  `course.attach_document` in `bootstrapMode.toolNames`, so the registry
  exposes the tool to the bootstrap-mode model.
- `packages/tools/src/course/attach-document.ts:23-25` throws
  `"course.attach_document requires a course-scoped session"` whenever
  `ctx.courseId === undefined`.
- Bootstrap sessions are opened without a `courseId` (there's no course yet),
  per `packages/core/src/services/session-service.ts:71-120` — the
  `ToolContext` for a bootstrap session has `courseId: undefined`.

So the tool is advertised, the model calls it (the natural next step after
`course.list_library_documents`), the handler throws every time, and the model
improvises a recovery.

The `bootstrapToolsFragment` system prompt even names the tool explicitly
("course.attach_document — attach a library document to the current course
(useful before exploration)"), reinforcing the trap.

## Fix options (pick one during scope)

1. **Drop from bootstrap.toolNames** (and the prompt fragment). Move attach to
   the post-confirmation path: the student attaches documents once the course
   exists. The `course.start_exploration` flow already accepts an explicit list
   of `documentIds` and `BootstrapServiceImpl.persistDraft` records them at
   confirm time, so there's no functional regression — just a UX one
   (no "attach during bootstrap" affordance).
2. **Defer-attach via the draft.** Let `course.attach_document` write to the
   in-memory draft when there's no courseId yet, and have `course.confirm_draft`
   materialise those attachments alongside the explorer-discovered ones. More
   work, preserves the affordance the prompt advertises.

(1) is the minimal fix that resolves the symptom. (2) is the proper feature
build-out. The bootstrap explorer already does (2) under the hood for documents
passed to `course.start_exploration`, so the affordance gap might not matter.

## Origin

Surfaced during `story-fix-block-claude-code-builtins-from-tutor`. That story
fixed the `AskUserQuestion` interstitial; this is a distinct root cause behind
the second "Couldn't finish …" message in the same session transcript.
