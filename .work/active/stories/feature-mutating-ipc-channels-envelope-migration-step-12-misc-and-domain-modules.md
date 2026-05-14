---
id: feature-mutating-ipc-channels-envelope-migration-step-12-misc-and-domain-modules
kind: story
stage: implementing
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-11-sketches-concept-maps]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.auth.claude.status` and per-domain channel modules to envelope pattern

Cleanup step: misc invoke channels and the per-domain channel modules' invoke handlers (NOT their streaming handlers).

## Channels in scope

### In `ipc-server.ts`
- `praxis.auth.claude.status` (no-payload getter)
- (skip `praxis.auth.claude.login.start` — that's streaming, deferred per parent feature)

### In per-domain modules
For each of these files, find the `ipcMain.handle(...)` calls (NOT `ipcMain.on(...)` for streaming) and wrap:
- `packages/desktop/electron/main/document-scopes-channel.ts`
- `packages/desktop/electron/main/bootstrap-drafts-channel.ts` — invoke handlers only
- `packages/desktop/electron/main/ingest-channel.ts` — invoke handlers only
- `packages/desktop/electron/main/quick-check-channel.ts` — invoke handlers only
- `packages/desktop/electron/main/subagent-channel.ts` — invoke handlers only
- `packages/desktop/electron/main/activity-channel.ts` — invoke handlers only
- `packages/desktop/electron/main/log-channel.ts` — invoke handlers only

For each module, also update its corresponding client (`@praxis/client/services/<domain>-client.ts`) to call `unwrapEnvelope`.

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (line ~1084 for auth.claude.status)
- The 7 per-domain module files (invoke handlers only)
- Corresponding client files
- `packages/desktop/electron/main/__tests__/misc-and-domain-channel-envelope.test.ts` (new — covers a representative sample)

## Acceptance
- Every invoke handler in `ipc-server.ts` AND in per-domain modules is wrapped.
- After this step: `grep -E 'handle\("praxis\\.[^"]+", async' packages/desktop/electron/main/*.ts` should return ONLY streaming handlers (`*.events.start` / `.cancel`) and registration helpers — no raw mutating invoke channels.
- All client services call `unwrapEnvelope`.
- Integration test covers a representative invoke channel from each module.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Low — these are mostly small modules; the streaming side is untouched.
- **Rollback**: revert the commit.

## Final verification
After this step lands:
- `grep -nE 'handle\("praxis\\.[^"]+", async' packages/desktop/electron/main/*.ts | grep -v "handleEnvelope\\|wrapEnvelope"` returns ONLY the streaming `*.events.start` / `.cancel` handlers (their wire format is the per-event subscriber-fanout-stream envelope).
- `gate-security-ipc-helpers-rethrow-redactor-gap` is now subsumed: every invoke channel returns an envelope; the `ipc-helpers.handle` re-throw never reaches the renderer wire because all production handlers are wrapped.

After this step:
1. Advance `gate-security-ipc-helpers-rethrow-redactor-gap` to `done` (verify-only — no remaining gap to close).
2. Notify the parent feature; orchestrator advances feature `implementing → review`.
