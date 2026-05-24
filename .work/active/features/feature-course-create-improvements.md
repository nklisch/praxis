---
id: feature-course-create-improvements
kind: feature
stage: implementing
tags: [ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Course-create entry & continuity improvements

## Brief
Three independent improvements to the course-create flow that surfaced during dogfooding. The feature is a tracking bucket — each child story is small, self-contained, and works on its own; no design pass needed at the feature level.

## Children
1. **`story-fix-create-to-design-docs-missing`** (bug, `/agile-workflow:fix`) — documents uploaded in the first section of course-create don't appear on the course-design side after the transition. Likely a document-scope linkage gap (session-scoped attach not promoted to course-scope on confirm, OR design session reading from a different scope).
2. **`story-create-course-select-existing-docs`** — entry screen currently only offers upload / pack / create-your-own; add a "select from existing documents" affordance so the user can seed a new course from already-indexed library documents.
3. **`story-create-course-pack-upload-polish`** — visual polish on the entry-screen pack/upload/create row: spacing too crowded, items justified to bottom rather than aligned with upload text baseline, leading symbols too close to words, pack tiles undersized vs the original mocks.

Children are independent — `depends_on: []` for each, no internal ordering. Implementation can fan out via `/agile-workflow:implement-orchestrator` once any drafting is settled, or worked individually.

## Source ideas absorbed
- `idea-create-to-design-docs-missing` → bug child story
- `idea-create-course-select-existing-docs` → child story
- `idea-create-course-pack-upload-polish` → child story
