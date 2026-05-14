---
id: feature-mutating-ipc-channels-envelope-migration-step-2-documents
kind: story
stage: review
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

## Implementation

Channels migrated (3):
- `praxis.documents.list` — `wrapEnvelope` (no-payload getter)
- `praxis.documents.get` — `handleEnvelope` + `z.string().min(1, "documentId")`
- `praxis.documents.delete` — `handleEnvelope` + `z.string().min(1, "documentId")`

Client methods updated (3): `list`, `get`, `delete` in `DocumentsClientImpl` all call `unwrapEnvelope(result)`.

Tests: 17 new tests in `documents-channel-envelope.test.ts` covering success, null/empty validation, type-mismatch validation, INTERNAL error, and path-leakage redaction for all 3 channels.

Also updated `ipc-server.envelope-migration.test.ts`: converted the stale "non-migrated control" test for `praxis.documents.list` to a migrated-channel confirmation.

Verification:
- `pnpm --filter @praxis/desktop typecheck` — pass
- `pnpm --filter @praxis/client typecheck` — pass
- New test file: 17/17 pass
- `pnpm --filter @praxis/desktop test` — 171/171 pass (16 files)
- `pnpm --filter @praxis/client test` — 62/62 pass (7 files)
