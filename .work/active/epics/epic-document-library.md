---
id: idea-document-library-overhaul
created: 2026-05-13
tags: []
---

Overhaul the document surface end-to-end — attachment flow, scoping primitives, viewing, and library navigation — as one coherent design rather than ad-hoc widgets, so users can move fluidly between "what's attached here" and "what's in my whole library."

Concrete pieces folded in:
- **Better attachment UX**: support multi-file selection in a single dialog, and folder-level selection, instead of attaching files one at a time. Useful when seeding a course from a textbook split across many PDFs/PPTXs or a directory of materials.
- **Scope attachments to the bootstrap session, not just the course**: today bootstrap reads from `course_documents` which links to a course, so doc sets leak across re-bootstraps and parallel exploration runs. Add a bootstrap-session scope so each exploration owns its own document set cleanly — enables "try this textbook vs. that textbook" comparisons and keeps ingestion side-effects scoped to the run that produced them.
- **Dedicated document-viewer tab type**: alongside chat/quiz/etc. tabs, let the user open a single ingested document in its own workspace tab — a real reading surface, not a modal preview.
- **Scoped sidebar**: the documents listed in the sidebar should reflect only docs visible for the current scope (course, bootstrap session, lesson) rather than the global library.
- **Advanced library view with tabs + filters**: promote the global document view from a flat list into a library UI with tabs ("all," "this course," "this lesson," "this bootstrap session," "orphaned/unscoped") and filters within tabs (source / type / date). Tabs anchor pivots; filters refine within a tab.

Related, kept separate: `idea-rename-query-textbook-to-query-documents` (small rename — "textbook" no longer reflects what's actually attached; falls naturally out of this overhaul but stands alone as a low-cost cleanup).

Key files: `course_documents` join table and `CourseDocumentsServiceImpl` in `packages/core/src/services/`, bootstrap explorer tools in `packages/tools/src/course/`, `BootstrapServiceImpl.persistDraft`, the document/library views in `packages/ui/src/`.

Treat at scope time as one design — attachment, scoping primitive, viewer, and library navigation are facets of one surface, not four independent stories.
