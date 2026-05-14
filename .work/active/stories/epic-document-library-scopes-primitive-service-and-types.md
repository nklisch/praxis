---
id: epic-document-library-scopes-primitive-service-and-types
kind: story
stage: done
tags: [core, documents]
parent: epic-document-library-scopes-primitive
depends_on: [epic-document-library-scopes-primitive-schema-and-migration]
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
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

## Implementation Notes

### Files created
- `packages/core/src/types/document-scopes.ts` — new types: `ScopeKind`,
  `DocumentScope`, `DocumentScopeSource`, `DocumentScopeAttachment`
- `packages/core/src/services/document-scopes-service.ts` —
  `DocumentScopesServiceImpl` implementing all 7 methods
- `packages/core/src/services/__tests__/document-scopes-service.test.ts` —
  23 tests covering all 7 methods (multi-scope, idempotency, promoteScope,
  FK cascade)

### Files modified
- `packages/core/src/types/index.ts` — re-exports `document-scopes.ts`;
  renamed `CourseDocumentsClientApi` → `DocumentScopesClientApi` in named
  export from `client.ts`
- `packages/core/src/types/tool.ts` — replaced `CourseDocumentsService`
  interface with `DocumentScopesService` (7 methods); renamed
  `ToolServices.courseDocuments` → `ToolServices.documentScopes`
- `packages/core/src/types/client.ts` — renamed
  `CourseDocumentsClientApi` → `DocumentScopesClientApi` with
  scope-shaped API; renamed `PraxisClient.courseDocuments` →
  `PraxisClient.documentScopes`
- `packages/core/src/services/types.ts` — renamed
  `ServiceDeps.toolServices.courseDocuments` →
  `ServiceDeps.toolServices.documentScopes` (imported
  `DocumentScopesService` instead of `CourseDocumentsService`)
- `packages/core/src/services/index.ts` — replaced
  `CourseDocumentsServiceDeps` / `CourseDocumentsServiceImpl` exports with
  `DocumentScopesServiceDeps` / `DocumentScopesServiceImpl`
- `tests/helpers/mocks.ts` — renamed `noopCourseDocuments()` →
  `noopDocumentScopes()` with the 7-method interface

### Files deleted
- `packages/core/src/services/course-documents-service.ts` (via git rm)
- `packages/core/src/services/__tests__/course-documents-service.test.ts`
  (via git rm)

### Test result
`pnpm vitest run packages/core/src/services/__tests__/document-scopes-service.test.ts`
— 23/23 tests pass. All 246 core service tests pass (no regression).

### Expected outstanding typecheck failures
`pnpm --filter @praxis/core typecheck` fails with 5 errors — all in
call-site files that still reference `courseDocuments`:
- `src/ingestion/service.ts` — `CourseDocumentsService` import + field
- `src/services/bootstrap-service.ts` — `CourseDocumentsService` import + field
- `src/services/session-service.ts` — `courseDocuments` references (×3)

These are in scope for `epic-document-library-scopes-primitive-callsite-sweep`.
Full-workspace `pnpm typecheck` will also fail for the same reason plus
call sites in `@praxis/desktop`, `@praxis/tools`, and `@praxis/client`.
All intentional per the story boundary.

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- All 7 methods of `DocumentScopesService` implemented per design: `listForScope`, `listForScopeDetailed`, `attach`, `detach`, `attachMany`, `listScopesForDocument`, `promoteScope`.
- `attachMany` uses a transaction with pre-check (existing scope ids → set diff → bulk insert) — single round-trip, idempotent.
- `listScopesForDocument` re-brands `scopeId` as the correct `CourseId | SessionId` based on `scopeKind` — discriminated union returned correctly.
- `promoteScope` correctly preserves source rows (per design's "session rows persist for audit").
- Test coverage: 23/23 tests; covers all methods including multi-scope, idempotency, promote-idempotency, and FK cascade on document delete.
- Old service + interface + tests deleted cleanly via `git rm`.
- Expected workspace typecheck failures (callsites still reference `courseDocuments`) are documented and resolved in the next story.
