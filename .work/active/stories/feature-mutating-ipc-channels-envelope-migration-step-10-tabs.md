---
id: feature-mutating-ipc-channels-envelope-migration-step-10-tabs
kind: story
stage: review
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
