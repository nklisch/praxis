---
id: story-bootstrap-attach-document-fix
kind: story
stage: implementing
tags: [bug, bootstrap]
parent: epic-bootstrap-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Resolve `course.attach_document` advertised-but-throws trap in bootstrap mode

## Symptom

During a bootstrap session, the tutor called `course.attach_document` and
the chat rendered "Couldn't finish course attach document." The tutor
rationalised the failure as "The attach_document tool only works inside a
course-scoped session, and we're still in bootstrap mode."

## Root cause

Mode declaration and tool implementation disagree about when this tool is
valid.

- `packages/curriculum/src/modes/bootstrap.ts:39` lists
  `course.attach_document` in `bootstrapMode.toolNames`, so the registry
  exposes the tool to the bootstrap-mode model.
- `packages/tools/src/course/attach-document.ts:23-25` throws
  `"course.attach_document requires a course-scoped session"` whenever
  `ctx.courseId === undefined`.
- Bootstrap sessions are opened without a `courseId` (no course exists
  yet) per `packages/core/src/services/session-service.ts:71-120`.

So the tool is advertised, the model calls it, the handler throws every
time, and the model improvises a recovery. The `bootstrapToolsFragment`
system prompt even names the tool explicitly, reinforcing the trap.

## Fix shape

Two options surfaced during park; the design pass on this story picks
one.

1. **Drop from bootstrap.toolNames + prompt fragment.** Minimal fix. The
   `course.start_exploration` flow already accepts an explicit list of
   `documentIds` and `BootstrapServiceImpl.persistDraft` records them at
   confirm time, so no functional regression — just the loss of an
   affordance the agent today can't actually use.
2. **Defer-attach via the draft.** Let `course.attach_document` write to
   the in-memory (post-`durable-drafts`, persistent) draft when there's
   no courseId yet, and have `course.confirm_draft` materialise those
   attachments alongside explorer-discovered ones. Preserves the
   affordance.

Recommend option 1 (drop) for this story — minimal, surgical. Option 2 is
a feature, not a fix, and if anyone wants it the right home is
`epic-bootstrap-readiness-expressive-draft-api` (where a new
`attach_document` op on the `DraftEditOp` union would fit naturally).

## Acceptance

- `course.attach_document` no longer appears in `bootstrapMode.toolNames`.
- `bootstrapToolsFragment` no longer lists `course.attach_document` in
  the "Tools available in bootstrap mode" prose.
- A regression test asserts the tool is absent from `bootstrapMode.toolNames`.
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Epic context
- Parent epic: `epic-bootstrap-readiness`
- Position in epic: independent fix; can land first wave alongside the
  other prompt-and-mode stories.

## Originating backlog
- `idea-bootstrap-attach-document-throws-without-course` — consumed by
  this story; will be removed from `.work/backlog/` as part of
  epic-design.
