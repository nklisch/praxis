---
id: epic-document-library-scopes-primitive
kind: feature
stage: drafting
tags: [core, documents, ingestion, schema]
parent: epic-document-library
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# `document_scopes` polymorphic scoping primitive

## Brief

Today documents are linked to a course via `course_documents`
(`packages/artifacts/src/schema.ts:242-264`) — a course-only join, single
tier. That shape can't express bootstrap-session ownership, lesson-level
scoping, or any other future scope, and the table name leaks the assumption
that everything is course-bound.

This feature replaces `course_documents` with a polymorphic
`document_scopes` join: rows of `(document_id, scope_kind, scope_id,
source, attached_at)` where `scope_kind` starts as `'course' | 'session'`
and is extensible without schema migration. A document can have multiple
rows — multiple scopes simultaneously — supporting "this doc is attached to
a course AND was originally ingested during this bootstrap session."

The feature includes: schema change, Drizzle migration that moves existing
`course_documents` rows into `document_scopes` with `scope_kind='course'`,
`DocumentScopesServiceImpl` replacing/wrapping `CourseDocumentsServiceImpl`,
updates to every call site listed in the anchors, and updates to the
ingestion-service auto-attach path (now takes a scope, not a courseId).
This is the **foundation feature** — every other child feature in this
epic depends on it.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: **foundation feature** — three downstream features
  (`bootstrap-session-scoped-attachment`, `document-viewer-tab-scoped-sidebar`,
  `library-view-tabs-and-filters`) all consume the new scoping primitive.

## Foundation references

- `docs/ARCHITECTURE.md` — "Document scoping" section (rolled forward at
  epic-design time; this feature realizes it)

## Anchors (current implementation)

- Current schema — `packages/artifacts/src/schema.ts:242-264`
  (`course_documents` table + indexes); migration in
  `drizzle/0009_round_siren.sql`
- Service — `CourseDocumentsServiceImpl` in
  `packages/core/src/services/course-documents-service.ts:18-110` (methods:
  `listForCourse`, `listForCourseDetailed`, `attach`, `detach`, `attachMany`)
- Call sites to update:
  - Bootstrap confirm — `packages/core/src/services/bootstrap-service.ts:553-566`
  - Tool — `packages/tools/src/course/attach-document.ts:26`
  - IPC channel — `packages/desktop/electron/main/course-documents-channel.ts:17-49`
  - Ingestion auto-attach — `packages/core/src/ingestion/service.ts:155-163`
  - Client RPC — `packages/client/src/services/course-documents-client.ts`
- Related tables stay unchanged: `documents`
  (`packages/artifacts/src/schema.ts:202-240`), `documentChunks` (264-275)

## Design notes for feature-design

- Composite PK: `(document_id, scope_kind, scope_id)` — allows the same
  document in multiple scopes.
- No FK from `scope_id` to a specific table (polymorphic). Service-layer
  validation checks the scope exists at write time.
- `source` column carries `'manual' | 'bootstrap' | …` like the current
  `course_documents.source`.
- Migration (resolved): copy every `course_documents` row to
  `document_scopes` with `scope_kind='course'`, then **drop**
  `course_documents` in the same migration. One source of truth from the
  moment migration runs.
- `CourseDocumentsServiceImpl` is **fully replaced** by a new
  `DocumentScopesServiceImpl` (no facade). The ~5 call sites are bounded;
  a clean break is cheaper than two surfaces.
