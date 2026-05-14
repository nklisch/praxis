---
id: epic-document-library
kind: epic
stage: done
tags: [ui, documents, ingestion, configure, tutor-ux]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Document library overhaul — multi-scope attachment, viewer, navigable library

## Brief

Documents are central to Praxis — bootstrap reads them, the tutor cites them,
ingestion pipes them through embedded image / page raster stores — but the
surface around them is a patchwork of ad-hoc affordances. Attachment is
one-file-at-a-time, scoping is single-tier (`course_documents` links docs to a
course and only a course; bootstrap sessions can't own their own document
set, so re-bootstraps and parallel exploration runs leak doc sets into each
other), there's no real document viewer (just modal previews), the sidebar
always shows the global library regardless of where the user is, and the
runtime tool that retrieves from documents is still named `query_textbook`
even though most attachments aren't textbooks at all.

This epic overhauls the document surface end-to-end as one coherent design:
attachment, scoping primitive, viewing, library navigation, and tool naming.
The goal is fluid movement between "what's attached here" and "what's in my
whole library," with the scope-aware UI matching the scope-aware data.

## Scope absorbed from backlog

This epic absorbs five parks:

- `idea-document-library-overhaul` (this epic's source — umbrella)
- `idea-multi-file-folder-select-doc-attach` (multi-file + folder pickers)
- `idea-bootstrap-session-scoped-documents` (new scoping tier)
- `idea-dedicated-document-view-tab` (viewer tab type + scoped sidebar)
- `idea-advanced-document-library-view` (tabs + filters library UI)
- `idea-rename-query-textbook-to-query-documents` (tool/skill rename —
  confirmed at scope time to belong here; falls naturally out of the surface
  rework)

## Anchors (current implementation)

- `course_documents` join table and `CourseDocumentsServiceImpl` —
  `packages/core/src/services/` (today: course-only scoping)
- Bootstrap explorer tools — `packages/tools/src/course/`
  (`course.start_exploration`, `course.draft_*`)
- `BootstrapServiceImpl.persistDraft` — materializes drafts in one transaction
- Ingestion port — `Ingestor` in `packages/tools/src/runtime/ingestion/` with
  per-format adapters; `EmbeddedImageStore` / `PageImageStore` already
  content-address by document id
- Library / document UI — `packages/ui/src/` (sidebar, modal preview today)
- Tool to rename — `query_textbook` in `packages/tools/src/` (every
  reference: schema, handler, prompts that mention the tool, UI labels)

## Architecture decision (resolved at epic-design)

The scoping primitive becomes a **polymorphic `document_scopes` table**
keyed by `(document_id, scope_kind, scope_id)`, replacing the course-only
`course_documents` join. A document can belong to multiple scopes
simultaneously (a doc attached to a course can also be remembered as
having been ingested during a specific bootstrap session). Scope kinds
start with `'course'` and `'session'` and are extensible without schema
migration. On bootstrap-draft confirmation, session-scoped rows are
promoted to course-scope rows alongside the existing session rows — both
survive, so the doc is durably attached and the session audit trail is
preserved. `docs/ARCHITECTURE.md` has a new "Document scoping" section
that names this primitive as the present.

## Tool rename (resolved)

The retrieval tool to rename is `retrieve_from_textbook` (not
`query_textbook` as the original park said — the park used a remembered
name, the actual symbol in
`packages/tools/src/retrieval/retrieve-from-textbook.ts` is the truth).
Target name: `retrieve_from_documents`.

## Why now

Today's single-tier scoping is the biggest source of "leaks" in bootstrap
(docs from a previous exploration linger), and the flat library + modal
preview UI is hostile to anyone seeding a course from a real-world set of
materials (a folder of PDFs + slide decks + notes). Both pain points compound
the larger the user's library gets, so the longer this waits, the more user
data is locked into the wrong shape.

## Decomposition

Split by capability. Three features can land in parallel in wave 1
(scoping primitive, picker, rename — none depends on the others); the
other three are wave-2 consumers of the scoping primitive (bootstrap
session attachment, viewer/sidebar, library view). The rename is
intentionally independent so it doesn't sit behind the schema work, and
the picker is intentionally independent so multi-file/folder ergonomics
can ship even if the scoping work slips.

### Child features

**Wave 1 (no deps):**

- `epic-document-library-scopes-primitive` — polymorphic `document_scopes`
  table replacing `course_documents`; service + migration + every call
  site updated. — depends on: `[]`
- `epic-document-library-multi-file-folder-picker` — Electron dialog
  gains `multiSelections` + `openDirectory`; ingestion orchestrates
  batches; per-file ActivityRail items. — depends on: `[]`
- `epic-document-library-rename-retrieve-from-documents` — rename
  `retrieve_from_textbook` → `retrieve_from_documents` across tool source,
  every mode's `toolNames`, every prompt fragment, tests, COPY. —
  depends on: `[]`

**Wave 2 (after scoping primitive):**

- `epic-document-library-bootstrap-session-scoped-attachment` — bootstrap
  sessions own their own document set via `scope_kind='session'`;
  promote to course-scope on draft confirmation. — depends on:
  `[epic-document-library-scopes-primitive]`
- `epic-document-library-viewer-tab-scoped-sidebar` — new `document` tab
  kind with a real viewer (PDF/text/markdown first-class; PPTX/DOCX via
  embedded-image fallback); sidebar derives doc list from active scope
  (route/tab inference). — depends on:
  `[epic-document-library-scopes-primitive]`
- `epic-document-library-library-view-tabs-filters` — promote the global
  doc view into a library route with scope tabs ("All," "This course,"
  "This session," "Orphaned") and within-tab filters (type / source /
  date). — depends on: `[epic-document-library-scopes-primitive]`

### Decomposition risks

- **Migration risk on `course_documents` → `document_scopes`**:
  schema-level change with existing data. The feature-design pass on
  `scopes-primitive` must produce a deliberate migration SQL and decide
  whether `CourseDocumentsServiceImpl` becomes a facade or is fully
  replaced. Highest-risk feature in the epic.
- **Rename sweep miss**: `retrieve_from_documents` rename touches at
  least 7 files across `packages/tools` and `packages/curriculum`.
  Missing one leaves a stale registration that silently dis-registers
  the tool from that mode. The feature-design pass needs an exhaustive
  checklist sourced from the anchor list.
- **Scoped sidebar inference rules**: "active scope" is derived from
  route + active tab + session — could be confusing if rules aren't
  crisp. Design pass on `viewer-tab-scoped-sidebar` nails an explicit
  decision tree.
- **Bootstrap promotion semantics**: what happens when a session
  finishes without `confirmDraft`? Garbage-collect the session-scope
  rows immediately, retain as audit, or surface them in an "orphaned"
  library tab? Design pass on `bootstrap-session-scoped-attachment`
  decides.
- **Folder walk ergonomics**: depth limit, symlink policy, MIME filter
  consistency with the ingestor registry. Design pass on
  `multi-file-folder-picker` settles these.

## Review (2026-05-13) — aggregate

**Verdict**: Approve

All six child features shipped clean and were individually approved:
- `...scopes-primitive` (done) — polymorphic document_scopes table + service
- `...rename-retrieve-from-documents` (done) — tool surface clarity
- `...multi-file-folder-picker` (done) — bulk ingestion UX
- `...bootstrap-session-scoped-attachment` (done, review c797f3a) — session→course promotion
- `...viewer-tab-scoped-sidebar` (done, aggregate review f5090c7) — document tabs + scope-aware sidebar
- `...library-view-tabs-filters` (done, review aeced50) — library route with scope tabs + filters

**Aggregate-only checks**:
- Capability completeness: documents flow ingestion → scope-aware attachment → multi-format viewing in dedicated tabs → library-route pivoting by scope. End-to-end works.
- Foundation alignment: `docs/ARCHITECTURE.md` "Document scoping" section already describes session→course promotion; no drift. The "Student surface" tab system note accommodates `kind: "document"` cleanly.
- 2 follow-ups parked in backlog from the sidebar story review: `list-scopes-for-document-client-api` (complete branch 3 of useDerivedScope), `lift-tabs-state-to-context` (de-duplicate useTabs calls).

What's now possible: documents are first-class navigation citizens. Users can view them, scope them, surface orphaned ones, and the bootstrap explorer pulls from a session-owned set that promotes cleanly on course confirmation.
