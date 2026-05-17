---
id: feature-mutating-ipc-channels-envelope-migration-step-12-misc-and-domain-modules
kind: story
stage: done
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
- `praxis.tabs.openDocument` (`{ documentId: string; title: string }`) — found via grep in step-10 review; was not on the step-10 channel list; must be picked up here
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

## Implementation

### Channels migrated

**ipc-server.ts:**
- `praxis.auth.claude.status` — wrapped with `wrapEnvelope` (no-payload getter)
- `praxis.tabs.openDocument` — wrapped with `handleEnvelope` + Zod schema `{ documentId: z.string().min(1), title: z.string().min(1) }`

**document-scopes-channel.ts** — 5 invoke handlers wrapped with `wrapEnvelope`:
- `praxis.documentScopes.listOrphaned`
- `praxis.documentScopes.listForScope`
- `praxis.documentScopes.attach`
- `praxis.documentScopes.detach`
- `praxis.documentScopes.listScopesForDocument`

**ingest-channel.ts** — 4 invoke handlers wrapped with `wrapEnvelope` (streaming `praxis.ingest.start` left as-is per subscriber-fanout-stream pattern):
- `praxis.ingest.pickFile`
- `praxis.ingest.pickPaths`
- `praxis.ingest.isAvailable`
- `praxis.ingest.candidatesFor`

**quick-check-channel.ts** — 1 invoke handler wrapped:
- `praxis.quickCheck.resolve`

**subagent-channel.ts** — 1 invoke handler wrapped:
- `praxis.subAgent.list`

**activity-channel.ts** — 1 invoke handler wrapped:
- `praxis.activity.dismiss`

**bootstrap-drafts-channel.ts** — no invoke handlers (streaming only); log-channel.ts — uses `ipcMain.on` (fire-and-forget); both correctly skipped.

### Client files updated (`unwrapEnvelope`):
- `packages/client/src/services/claude-auth-client.ts` — `status()`
- `packages/client/src/services/tabs-client.ts` — `openDocument()`
- `packages/client/src/services/document-scopes-client.ts` — all 5 methods
- `packages/client/src/services/ingest-client.ts` — `pickFile()`, `pickPaths()`, `candidatesFor()`
- `packages/client/src/services/quick-check-client.ts` — `resolve()`
- `packages/client/src/services/sub-agent-client.ts` — `list()`
- `packages/client/src/services/activity-client.ts` — `dismiss()`

### Test file
`packages/desktop/electron/main/__tests__/misc-and-domain-channel-envelope.test.ts` — 21 tests covering a representative sample from each module: happy-path envelope returns, INTERNAL envelope on service throws, VALIDATION_FAILED for invalid payloads (tabs.openDocument), never-rejects contract.

### Final verification grep result
```
grep -nE 'handle\("praxis\.[^"]+", async' packages/desktop/electron/main/*.ts | grep -v "handleEnvelope|wrapEnvelope"
```
Output (ONLY streaming handlers remain):
- `activity-channel.ts:34: handle("praxis.activity.events.start", async ...`
- `bootstrap-drafts-channel.ts:28: handle("praxis.bootstrap.drafts.events.start", async ...`
- `quick-check-channel.ts:26: handle("praxis.quickCheck.events.start", async ...`
- `ipc-server.ts:1427: handle("praxis.auth.claude.login.start", async ...`

All 4 remaining raw handlers are streaming entry-points (`*.events.start` / `*.login.start`). Every invoke channel now returns an envelope.

### Verification results
- `pnpm --filter @praxis/desktop typecheck` — pass
- `pnpm --filter @praxis/client typecheck` — pass
- `pnpm --filter @praxis/ui typecheck` — pass
- `pnpm --filter @praxis/desktop test` — 399 tests across 26 files pass (includes 21 new tests)
- `pnpm --filter @praxis/client test` — 62 tests pass
- `pnpm lint` on all modified files — clean (no errors in changed files)

## Review

**Verdict: Approve**

**Final acceptance grep** — load-bearing check passed. Only 4 raw `handle(...)` calls remain, all streaming entry-points:
- `activity-channel.ts:34` — `praxis.activity.events.start`
- `bootstrap-drafts-channel.ts:28` — `praxis.bootstrap.drafts.events.start`
- `quick-check-channel.ts:26` — `praxis.quickCheck.events.start`
- `ipc-server.ts:1427` — `praxis.auth.claude.login.start`

Every invoke channel in `ipc-server.ts` and all 7 per-domain modules is now wrapped. The entire refactor's success criterion is met.

**Module-by-module verification:**
- `ipc-server.ts`: `praxis.auth.claude.status` uses `wrapEnvelope`; `praxis.tabs.openDocument` uses `handleEnvelope` + Zod (`min(1)` on both fields) — correct.
- `document-scopes-channel.ts`: all 5 invoke handlers wrapped with `wrapEnvelope`.
- `ingest-channel.ts`: 4 invoke handlers wrapped; streaming `praxis.ingest.start` correctly untouched.
- `quick-check-channel.ts`: `praxis.quickCheck.resolve` wrapped; streaming `events.start` untouched.
- `subagent-channel.ts`: `praxis.subAgent.list` wrapped; streaming `events.start` untouched.
- `activity-channel.ts`: `praxis.activity.dismiss` wrapped; streaming `events.start` untouched.
- `bootstrap-drafts-channel.ts`: correctly skipped — streaming-only module.
- `log-channel.ts`: correctly skipped — `ipcMain.on` fire-and-forget, not an invoke channel.

**Client services:** All 7 updated files (`claude-auth-client.ts`, `tabs-client.ts`, `document-scopes-client.ts`, `ingest-client.ts`, `quick-check-client.ts`, `sub-agent-client.ts`, `activity-client.ts`) call `unwrapEnvelope`. Each uses the `IpcEnvelope<T> | T` union type correctly for backward compatibility. `ingest-client.ts` preserves the synchronous `isAvailable()` boolean correctly (it was not an async invoke and was not touched).

**Tests:** 21 tests across all touched channel families. Coverage includes: happy-path envelope shape, INTERNAL on service throw (never-rejects contract), VALIDATION_FAILED for missing/empty payloads (`tabs.openDocument`). The `electron-ipc-test-harness` pattern is applied correctly — mock registered before import, handlers captured in Map, invoked directly.

**Typechecks:** `@praxis/desktop`, `@praxis/client`, `@praxis/ui` all pass cleanly with `tsgo`.

**Tests:** 399/399 `@praxis/desktop` (26 files), 62/62 `@praxis/client` (7 files).

No blockers. No nits beyond the minor discrepancy between the file header comment ("Test count: 20") and the actual 21 `it()` calls — harmless.

The `gate-security-ipc-helpers-rethrow-redactor-gap` security finding is now effectively closed: every invoke channel returns an envelope, so the raw re-throw in `ipc-helpers.handle` never reaches renderer wire in production.
