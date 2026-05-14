---
id: feature-mutating-ipc-channels-envelope-migration-step-10-tabs
kind: story
stage: done
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-9-notes-flashcards]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.tabs.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe. Tabs surface is hot — every UI route uses it via `TabsContext`.

## Channels in scope
- `praxis.tabs.listOpen` (no-payload)
- `praxis.tabs.list` (`{ limit?: number; includeClosed?: boolean }`)
- `praxis.tabs.get` (string — tabId)
- `praxis.tabs.open` (`{ sessionId: string; courseTitle?: string }`)
- `praxis.tabs.reopen` (string — tabId)
- `praxis.tabs.close` (string — tabId)
- `praxis.tabs.touch` (string — tabId)
- `praxis.tabs.rename` (`{ tabId: string; title: string }`)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~1139-1190)
- `packages/client/src/services/tabs-client.ts`
- `packages/ui/src/context/tabs-context.tsx` — verify error handling still works (the manual `try/catch` + `setError` branches catch `IpcError` since it extends `Error`; should be no-op change)
- `packages/desktop/electron/main/__tests__/tabs-channel-envelope.test.ts` (new)

## Acceptance
- All 8 channels wrapped.
- Client methods unwrap.
- Integration test covers listOpen (no payload), open (structured payload), close (string payload) — success + validation failure paths.
- Verify in TabsContext: error caught, setError works (no exception escapes).
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Medium — tabs hot path; an envelope shape mismatch breaks every chat UI.
- **Rollback**: revert the commit.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- File header comment says "Test count: 18" but 25 tests are present — stale after additions.

**Notes**:
- All 8 in-scope channels wrapped correctly. `listOpen` uses `wrapEnvelope` (no-payload, correct); the 7 others use `handleEnvelope` with explicit Zod schemas.
- `praxis.tabs.list` optional-object schema handles `{}` correctly — parses as `{}` (not `undefined`) and the guard `opts !== undefined` passes an empty spread which is functionally equivalent to no opts.
- `openDocument` confirmed unwrapped and NOT in step-12 scope as written. Added `praxis.tabs.openDocument` to step-12's channel list so the final acceptance grep passes.
- `tabs-context.tsx` not modified in this commit; the pre-existing formatter error (tabs vs spaces) is not introduced by this story.
- TabsContext error handling verified: all mutations `try/catch` and `setError(err instanceof Error ? err.message : String(err))` — catches `IpcError` transparently since it extends `Error`.
- 25 tests pass. Typecheck clean. Lint clean for touched files.
