---
id: gate-docs-roadmap-phase16-document-scopes
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: docs
created: 2026-05-14
updated: 2026-05-14
---

# ROADMAP Phase 16 build list still names `course_documents` table + `CourseDocumentsServiceImpl`

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ROADMAP.md:312`
- Code: `packages/artifacts/src/schema.ts:243-270`, `packages/core/src/services/document-scopes-service.ts:21`

## Current doc text
> - `course_documents` join table + `CourseDocumentsServiceImpl` — links ingested documents to specific courses so the explorer's retrieval is scoped.

## Reality
Bootstrap explorer retrieval is scoped via the polymorphic
`document_scopes` table (`scope_kind` ∈ `'course' | 'session'`) managed
by `DocumentScopesServiceImpl`. The session-scoped rows are promoted to
course-scope when the user confirms the draft.

## Required edit
Replace the bullet with: `document_scopes` polymorphic join table +
`DocumentScopesServiceImpl` — links ingested documents to scopes
(`course`, `session`) so the explorer's retrieval is scoped; bootstrap
sessions read from session-scope and promote to course-scope on confirm.

## Implementation
Updated `docs/ROADMAP.md` line 312: replaced the stale `course_documents` / `CourseDocumentsServiceImpl` bullet with the accurate `document_scopes` polymorphic join table + `DocumentScopesServiceImpl` description, including scope kinds (`course`, `session`) and the session-to-course promotion semantics. Code verified at `packages/artifacts/src/schema.ts:242-272` and `packages/core/src/services/document-scopes-service.ts:21`. Required edit matched code exactly — no divergence found.
