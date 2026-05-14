---
id: feature-mutating-ipc-channels-envelope-migration-step-2-documents
kind: story
stage: implementing
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-1-session]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.documents.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe.

## Channels in scope
- `praxis.documents.list` (no-payload getter)
- `praxis.documents.get` (string payload — documentId)
- `praxis.documents.delete` (string payload — documentId)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~281-292)
- `packages/client/src/services/documents-client.ts`
- `packages/desktop/electron/main/__tests__/documents-channel-envelope.test.ts` (new)

## Acceptance
- All 3 channels wrapped.
- Client methods unwrap.
- Integration test asserts envelope shape (success + validation failure on `get`/`delete` with empty/missing string).
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Low — documents API is read-mostly; only `delete` mutates and is called rarely.
- **Rollback**: revert the commit.
