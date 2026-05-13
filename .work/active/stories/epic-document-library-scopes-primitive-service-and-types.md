---
id: epic-document-library-scopes-primitive-service-and-types
kind: story
stage: implementing
tags: [core, documents]
parent: epic-document-library-scopes-primitive
depends_on: [epic-document-library-scopes-primitive-schema-and-migration]
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Service + types: `DocumentScopesServiceImpl`

## Scope

Land the new types (`DocumentScope`, `ScopeKind`, `DocumentScopeSource`,
`DocumentScopeAttachment`), the new service interface
(`DocumentScopesService`), the new service implementation
(`DocumentScopesServiceImpl`), and the new test file. Delete the old
`CourseDocumentsService` interface, `CourseDocumentsServiceImpl`, and
its test file.

After this story, the new service compiles and tests pass for the
service in isolation — but call sites still reference the deleted
`courseDocuments` field, so the full repo doesn't typecheck yet. That
gets cleaned up in the next story.

## Units in this story

- Unit 3 (types)
- Unit 4 (service implementation)
- Unit 6 (delete old service file + interface + tests)
- Unit 7 (new test file)

## Acceptance Criteria

- [ ] `packages/core/src/types/document-scopes.ts` exports
      `DocumentScope`, `ScopeKind`, `DocumentScopeSource`,
      `DocumentScopeAttachment`; re-exported from
      `packages/core/src/types/index.ts`.
- [ ] `DocumentScopesService` interface present in
      `packages/core/src/types/tool.ts`; old `CourseDocumentsService`
      removed.
- [ ] `ServiceBundle.documentScopes` typed; old `courseDocuments`
      field removed.
- [ ] `packages/core/src/services/document-scopes-service.ts`
      implements all 7 methods per the design.
- [ ] `packages/core/src/services/course-documents-service.ts`
      deleted.
- [ ] `packages/core/src/services/__tests__/course-documents-service.test.ts`
      deleted; new
      `packages/core/src/services/__tests__/document-scopes-service.test.ts`
      added covering all 7 methods (incl. multi-scope and
      `promoteScope`).
- [ ] `pnpm vitest run packages/core/src/services/__tests__/document-scopes-service.test.ts`
      green.
- [ ] (The repo as a whole will not typecheck — that's expected at this
      story boundary.)

## Out of scope

- Call-site updates (story `…-callsite-sweep`).
- IPC / client changes (story `…-callsite-sweep`).
