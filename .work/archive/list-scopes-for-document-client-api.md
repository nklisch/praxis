---
id: list-scopes-for-document-client-api
kind: story
stage: done
tags: [ui, documents, ipc]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
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

## Implementation notes (2026-05-14)

- Added `listScopesForDocument(documentId)` to `DocumentScopesClientApi` in
  `packages/core/src/types/client.ts`.
- Wired the IPC handler `praxis.documentScopes.listScopesForDocument` in
  `packages/desktop/electron/main/document-scopes-channel.ts` (invoke-only,
  delegates to the existing `services.documentScopes.listScopesForDocument`).
- Added the client wrapper in
  `packages/client/src/services/document-scopes-client.ts`.
- Rewrote `useDerivedScope` branch 3 in
  `packages/ui/src/hooks/use-derived-scope.ts` to call
  `client.documentScopes.listScopesForDocument(documentId)` via
  `useResource`. Picks the primary scope via the new exported
  `pickPrimaryScope` helper: course preferred over session, returns null
  when neither.
- Branch 3 falls back to `{ kind: "all" }` while the fetch is pending and
  when the document is orphaned (no scopes attached). This preserves the
  graceful default of the prior implementation.
- Updated `packages/ui/src/hooks/__tests__/use-derived-scope.test.tsx`:
  every renderHook now uses a `PraxisClientProvider` wrapper; added
  `setListScopesForDocument` helper that swaps the per-test fake
  implementation; added three new branch-3 cases (primary-is-course,
  course-preferred-over-session, session-only-fallback) plus an
  orphan-document case. All 18 tests pass.

## Verification

- `pnpm --filter @praxis/ui typecheck`: green.
- `pnpm --filter @praxis/client typecheck`: green.
- `pnpm --filter @praxis/ui test`: 1010 tests pass (including 18 in
  `use-derived-scope.test.tsx` and 12 in `chat-route.test.tsx`).

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Clean four-layer wire: type contract → IPC handler → client
wrapper → UI hook. `pickPrimaryScope` is exported as a separate
testable helper. The "course preferred over session, else null" rule
is documented in the JSDoc and exercised by three new test cases.
Branch 3 falls back to `{ kind: "all" }` while the resource is
pending or when the document is orphan — graceful degradation. 18
tests pass; the previously-unchecked AC from the sidebar story is
now satisfied. Ready to advance.
