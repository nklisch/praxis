---
id: gate-docs-claude-md-document-scopes-primitive
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

# CLAUDE.md still names `course_documents` join + `CourseDocumentsServiceImpl` as the document scoping primitive

## Drift category
claude-md-staleness

## Location
- Doc: `CLAUDE.md:114`
- Code: `packages/artifacts/src/schema.ts:243-270`, `packages/core/src/services/document-scopes-service.ts:21`

## Current doc text
> **Course documents join**: `CourseDocumentsServiceImpl` in `@praxis/core/services` manages the `course_documents` join table that links ingested documents to specific courses. Used by the bootstrap explorer to scope which documents an exploration session reads.

## Reality
`course_documents` has been replaced by the polymorphic `document_scopes`
table (`packages/artifacts/src/schema.ts:243-270`) keyed by
`(document_id, scope_kind, scope_id, source, attached_at)`. The service
is `DocumentScopesServiceImpl` in
`packages/core/src/services/document-scopes-service.ts:21` (exported
from `packages/core/src/services/index.ts:61`). Scope kinds are
`'course' | 'session'` and a single document can belong to multiple
scopes simultaneously. The bootstrap explorer reads session-scoped
documents and promotes them to course-scope on draft confirmation.

## Required edit
Replace the bullet so it names `DocumentScopesServiceImpl` and the
`document_scopes` polymorphic table with `scope_kind` of `'course' |
'session'`; describe that bootstrap explorations are session-scoped
and promote to course-scope on confirmation.

## Implementation
`CLAUDE.md:114` — replaced the `**Course documents join**` bullet with a `**Document scopes**` bullet referencing `DocumentScopesServiceImpl` and the `document_scopes` polymorphic table with `scope_kind: 'course' | 'session'`; describes bootstrap sessions as session-scoped and promotion to course-scope on draft confirmation. Verified against `packages/artifacts/src/schema.ts:242-272` (`documentScopes` table definition with `scope_kind` enum `["course", "session"]`) and `packages/core/src/services/document-scopes-service.ts:21` (`DocumentScopesServiceImpl` class) and `packages/core/src/services/index.ts:61` (export). Story description was accurate; no divergence found.
