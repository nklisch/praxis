---
id: list-scopes-for-document-client-api
kind: story
stage: implementing
tags: [ui, documents, ipc]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Wire `listScopesForDocument` through the client API

## Why

The sidebar story (`epic-document-library-viewer-tab-scoped-sidebar-sidebar`) shipped with branch 3 of `useDerivedScope` returning `{ kind: "all" }` as a fallback when an active document tab is open. The intended behaviour — "sidebar in document tab shows that document's primary scope's documents" — depends on `listScopesForDocument` being exposed on `DocumentScopesClientApi`, which it currently is not. The server-side `DocumentScopesServiceImpl.listScopesForDocument` already exists.

The acceptance criterion `[ ] Sidebar in document tab shows that document's primary scope's documents` is unchecked in the parent story for this reason. Discovered during /agile-workflow:review (2026-05-13).

## Scope

1. Add `listScopesForDocument(documentId: DocumentId): Promise<DocumentScope[]>` to `DocumentScopesClientApi` (`packages/core/src/types/client.ts`).
2. Implement the IPC handler in `packages/desktop/electron/main/ipc-server.ts` (channel `praxis.documentScopes.listScopesForDocument`).
3. Implement the client wrapper in `packages/client/src/services/document-scopes-client.ts`.
4. Replace the `{ kind: "all" }` return in `packages/ui/src/hooks/use-derived-scope.ts` branch 3 with a `useResource` fetch keyed on `activeTab.documentId` that picks the first course scope (else first session scope, else "all").
5. Test: branch 3 in `use-derived-scope.test.tsx` should resolve to a course scope when the document has one.

## Acceptance Criteria

- [ ] `client.documentScopes.listScopesForDocument(documentId)` returns the document's scope rows.
- [ ] `useDerivedScope` branch 3 returns the document's primary scope (course preferred over session).
- [ ] Sidebar shows that scope's documents when a document tab is active.
- [ ] Branch 3 test in `use-derived-scope.test.tsx` no longer asserts the "all" fallback.

## Out of scope

- Multi-scope picker UI (when a document is attached to multiple scopes; current heuristic is "first course, else first session").
