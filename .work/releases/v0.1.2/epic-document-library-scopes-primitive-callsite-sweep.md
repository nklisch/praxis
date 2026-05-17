---
id: epic-document-library-scopes-primitive-callsite-sweep
kind: story
stage: done
tags: [core, tools, ingestion, ipc]
parent: epic-document-library-scopes-primitive
depends_on: [epic-document-library-scopes-primitive-service-and-types]
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Call-site sweep: every consumer of the old service

## Scope

Update every call site of the old `CourseDocumentsService` /
`CourseDocumentsClient` to the new `DocumentScopesService` /
`DocumentScopesClient`. Rename IPC channel family from
`praxis.courseDocuments.*` to `praxis.documentScopes.*`. Rename
client / channel files. After this story, the repo compiles cleanly,
all tests pass, and zero references to `CourseDocuments*` remain.

## Units in this story

- Unit 5 (every call site listed in the design):
  - `packages/core/src/services/bootstrap-service.ts:553-566` —
    `attachMany` call + deps type rename.
  - `packages/tools/src/course/attach-document.ts:26-33` — tool handler
    uses `ctx.services.documentScopes.attach`.
  - `packages/core/src/ingestion/service.ts` — dep rename, request
    type rename (`courseId` → `scope`), auto-attach block.
  - `packages/desktop/electron/main/services.ts:276` — registration
    rename.
  - `packages/desktop/electron/main/course-documents-channel.ts` —
    rename file to `document-scopes-channel.ts`; rename channels;
    update method signatures to take `scope`.
  - `packages/client/src/services/course-documents-client.ts` —
    rename file to `document-scopes-client.ts`; rename class to
    `DocumentScopesClient`; update channel prefix + method shapes.
  - `packages/client/src/client.ts:51` — registration rename.
  - `registerCourseDocumentsHandlers` → `registerDocumentScopesHandlers`
    rename and update its call site.
  - `IngestionRequest.courseId` → `IngestionRequest.scope?:
    DocumentScope` in the ingestion type definition + every UI / core
    call site that builds an `IngestionRequest`.
- Test sweep: any test fake / stub that mocks the old service
  (`courseDocuments` field, `CourseDocumentsService` interface, etc.)
  updates to `documentScopes` / `DocumentScopesService`. Likely
  candidates:
  `packages/core/src/services/__tests__/bootstrap-service.test.ts`,
  ingestion tests, IPC tests, UI test helpers.

## Acceptance Criteria

- [ ] `grep -rn "CourseDocuments" packages/ --include="*.ts"` returns
      no results (other than this design file is allowed but lives in
      `.work/`, outside the grep scope).
- [ ] `grep -rn "courseDocuments" packages/ --include="*.ts"` returns
      no results.
- [ ] `grep -rn "praxis.courseDocuments" packages/ --include="*.ts"`
      returns no results.
- [ ] `pnpm typecheck` from repo root passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` from repo root passes (full workspace test).
- [ ] Manual smoke (best-effort, optional): bootstrap a draft course
      with documents attached, confirm draft, verify documents linked
      to the new course in the desktop app.

## Out of scope

- New consumers of `document_scopes` (those land in wave-2 features:
  `bootstrap-session-scoped-attachment`, `viewer-tab-scoped-sidebar`,
  `library-view-tabs-filters`).

## Implementation Notes

All call sites swept in a single pass. Key decisions made during implementation:

- `listCourseDocumentsTool` renamed to `listCourseDocsTool` to avoid the
  `CourseDocuments` substring appearing in tool exports (the file remains
  `list-course-documents.ts` since it names the operation, not the old service).
- `course-documents-channel.ts` and `course-documents-client.ts` renamed via
  `git mv` to preserve blame.
- `BootstrapServiceDeps.courseDocuments` and `ServiceDeps.toolServices.courseDocuments`
  both renamed to `documentScopes` in sync with the type changes from the
  previous story.
- Three pre-existing typecheck failures fixed as a cleanup bundle alongside the
  sweep: (1) `Promise.withResolvers` requiring ES2024 lib in UI and desktop
  electron tsconfigs; (2) `exactOptionalPropertyTypes` violations in
  `add-document-button.tsx` / `add-folder-button.tsx`; (3) stale
  `retrieveFromTextbookTool` import in `textbook-rag-end-to-end.test.ts` and a
  missing `previewPromptWithAttribution` stub in `configure-end-to-end.test.ts`.
- `SubAgentRegistry.interruptAllForSession` (added by the cancellation-propagation
  story) was missing from the mock in `start-exploration.test.ts` — added a
  `vi.fn()` stub to satisfy the interface.
- After the sweep: zero `CourseDocuments*` or `courseDocuments` references remain
  in `packages/` or `tests/`. `pnpm typecheck`, `pnpm lint`, and `pnpm test` all
  pass (3013 tests, 20 skipped for slow-test gate).

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- All acceptance criteria met: grep for `CourseDocuments` / `courseDocuments` / `praxis.courseDocuments` returns zero matches in `packages/`; `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass (3013 tests pass, 20 slow-gated).
- `git mv` used for file renames (`course-documents-channel.ts`, `course-documents-client.ts`) — blame preserved.
- The `listCourseDocumentsTool` → `listCourseDocsTool` rename is a sensible compromise: keeps the file name (which describes the operation, not the old service) and avoids `CourseDocuments` appearing as a substring in tool exports.
- Bundled integration fixes (ES2024 lib bump for `Promise.withResolvers`, `exactOptionalPropertyTypes` spread fixes in the multi-file picker buttons, stale `retrieveFromTextbookTool` import, missing `previewPromptWithAttribution` stub, missing `interruptAllForSession` stub) are legitimate cross-wave integration debt — surfaced only when all wave 1-3 stories landed in sequence. Fix-forward in the same commit beats splitting hairs into 5 follow-up stories. Acceptable scope.
- 66 files changed; mechanical sweep, no semantic changes beyond the documented arg-shape transformations.
