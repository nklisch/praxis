---
id: feature-mutating-ipc-channels-envelope-migration-step-9-notes-flashcards
kind: story
stage: done
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-8-author]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.notes.*` and `praxis.flashcards.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe.

## Channels in scope
- `praxis.notes.update` (`{ noteId: string; body: unknown }`)
- `praxis.notes.get` (string — noteId)
- `praxis.notes.delete` (string — noteId)
- `praxis.flashcards.get` (string — flashcardId)
- `praxis.flashcards.delete` (string — flashcardId)
- `praxis.flashcards.dueCount` (no-payload)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~938-1080 region)
- `packages/client/src/services/notes-client.ts`
- `packages/client/src/services/flashcards-client.ts`
- `packages/desktop/electron/main/__tests__/notes-flashcards-channel-envelope.test.ts` (new)

## Acceptance
- All 6 channels wrapped.
- Client methods unwrap.
- Integration test covers update (structured payload) + delete (string payload) + dueCount (no payload), with success + validation failure paths.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Low — workspace-side affordances; user-facing failure path is "operation didn't take", easy to retry.
- **Rollback**: revert the commit.
