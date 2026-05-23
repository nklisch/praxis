---
id: epic-course-create-readiness-attach-doc-modal-stuck
kind: story
stage: implementing
tags: [ui, ingestion, bug]
parent: epic-course-create-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Course-create attach-doc modal stuck

## Brief

In the course-create (course-design) flow, attaching documents shows a
stacking bug: after the user finishes the attach flow the "done" modal
appears, but the previous modal in the chain stays mounted underneath it
instead of dismissing. Once the user closes both modals, no attached
documents are visible on the course-design surface.

Two suspected causes, both likely contributing:

1. **Modal-dismissal regression** — the previous step's modal doesn't
   unmount before the success modal opens. Investigate the modal
   lifecycle in the attach-from-library and inline-upload paths (the
   `modal-primitive` pattern owns the backdrop / ESC / click-outside
   behavior; per-step open/close state lives in the calling components).
2. **Scopes-refresh gap** — the CourseCreate attachments list doesn't
   re-read from the backing scope after `documentScopes.attach`. Check
   that the attach action triggers a refresh (or that the
   `DocumentScopesService` subscriber stream fans out a change that the
   CourseCreate view consumes).

## Repro and fix path

1. Open course-create.
2. Trigger Attach from Library → pick a document → confirm.
3. Observe: success modal appears, but the picker modal stays mounted
   under it; closing both leaves the attachments list empty.
4. Fix the modal lifecycle so the picker dismisses before success
   renders; fix the scopes refresh so the attachments list re-reads after
   attach completes.
5. Add a UI test covering the flow end-to-end.
