---
id: epic-document-library-scopes-primitive-schema-and-migration
kind: story
stage: implementing
tags: [core, documents, schema]
parent: epic-document-library-scopes-primitive
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Schema + migration: `document_scopes` table

## Scope

Land the schema change and the Drizzle migration that moves
`course_documents` data into the new `document_scopes` table. Pure DB
work — no service or call-site changes yet. The schema change leaves
the consuming service file (`course-documents-service.ts`) referencing
a now-deleted export, which `pnpm typecheck` will flag; that's expected
and gets fixed in the next story.

This is the foundation story — the next two stories build on it.

## Units in this story

- Unit 1 (schema change in `packages/artifacts/src/schema.ts`)
- Unit 2 (Drizzle migration SQL with data-copy + drop)

## Acceptance Criteria

- [ ] `courseDocuments` export removed from
      `packages/artifacts/src/schema.ts`; `documentScopes` export
      present per the design.
- [ ] New migration file in `drizzle/` (next sequence number, likely
      `0014_*.sql`) generated via `pnpm db:generate` and hand-edited to
      include the `INSERT … SELECT … FROM course_documents` and `DROP
      TABLE course_documents` steps.
- [ ] `drizzle/meta/_journal.json` updated by `db:generate` (auto).
- [ ] `pnpm db:reset` runs cleanly on a fresh DB.
- [ ] (Manual) On a populated dev DB, the migration preserves every
      `course_documents` row as a `document_scopes` row with
      `scope_kind='course'`.

## Out of scope

- Service implementation (story `…-service-and-types`)
- Call-site updates (story `…-callsite-sweep`)
- Type changes (story `…-service-and-types`)
- The repo will not typecheck at the end of this story — that's
  expected. Don't fix typecheck errors here.
