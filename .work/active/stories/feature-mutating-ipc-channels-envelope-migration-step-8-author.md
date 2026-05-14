---
id: feature-mutating-ipc-channels-envelope-migration-step-8-author
kind: story
stage: review
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-7-lock-and-config]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.author.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe. Largest channel family — ~12 channels.

## Channels in scope
First identify the full list via `grep -n 'handle("praxis.author.' packages/desktop/electron/main/ipc-server.ts`. Visible from earlier inventory:
- `praxis.author.deleteGate` (`{ gateId: string; reason?: string }`)
- `praxis.author.getCourseSummary` (string — courseId)
- `praxis.author.listFragmentOverrides` (`{ modeId: string }`)
- `praxis.author.setGlobalPrompt` (`{ text: string | null }`)
- `praxis.author.getGlobalPrompt` (no-payload)
- `praxis.author.getModeAppend` (`{ modeId: string }`)
- `praxis.author.exportMemory` (`{ targetPath: string }`)
- ...plus any other `praxis.author.*` channels not listed above (check inventory)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~735-870 region)
- `packages/client/src/services/author-client.ts`
- `packages/desktop/electron/main/__tests__/author-channel-envelope.test.ts` (new)

## Acceptance
- Every `praxis.author.*` invoke channel wrapped.
- Client methods unwrap.
- Integration test covers a no-payload getter, a structured-payload mutation, and validation-failure paths.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Medium — author surface is power-user; UI affordances (Configure tab, prompt editor) consume these.
- **Rollback**: revert the commit.

## Implementation notes
- This step has the most surface area. Scope discipline: do not refactor author-channel logic, only the wire-format wrap. Save logic refactors for separate stories.
- The `praxis.author.exportMemory` channel touches the filesystem — verify path-validation schema preserves the original behavior.
