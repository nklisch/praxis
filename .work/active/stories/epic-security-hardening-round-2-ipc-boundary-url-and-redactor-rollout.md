---
id: epic-security-hardening-round-2-ipc-boundary-url-and-redactor-rollout
kind: story
stage: implementing
tags: [security, desktop, core]
parent: epic-security-hardening-round-2-ipc-boundary
depends_on: [epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor]
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Shared URL allowlist + per-channel envelope migration + redactor wiring

## Scope

The "everything else" story that runs in parallel with the
engineConfig-shape story. After this story:
- `isAllowedExternalUrl(input)` exists in `@praxis/core/types/url-allowlist.ts`
  and is used at both `praxis.shell.openExternal` and the two
  `UpdateFeedSchema` URL refines (so the two call-sites can't drift).
- The remaining IPC channels listed below are migrated to
  `wrapEnvelope` (+ `withSchema` where they have non-trivial input):
  `praxis.config.setSelectedEngine`, `praxis.config.setBootstrapConfig`,
  `praxis.shell.openExternal`, `praxis.config.setLockCode`,
  `praxis.lock.setLockCode`, `praxis.lock.unlock`, `praxis.lock.clearLock`,
  `praxis.update.checkLatest`.
- Every IPC main-process error path uses `serializeErrorRedacted`
  (not `serializeError`) — verified by a sweep of `ipc-server.ts`,
  `ipc-helpers.ts`, and every `*-channel.ts` under
  `packages/desktop/electron/main/`.

This story does NOT touch the `praxis.config.engineConfig`,
`praxis.config.engineConfig.reveal`, or `praxis.config.setEngineConfig`
channels — the engineConfig-shape story owns those. No file overlap
with the parallel story.

## Units in this story

- Unit 3: Shared URL allowlist helper
  - `packages/core/src/types/url-allowlist.ts` (new)
  - `packages/core/src/types/index.ts` (export)
  - `packages/desktop/electron/main/ipc-server.ts` (`praxis.shell.openExternal`)
  - `packages/core/src/services/update-service.ts` (two `.refine(...)` call-sites)
- Unit 5: Per-channel migration for the channels listed above.
- Unit 6: Logger error-path scrubbing sweep
  - `packages/desktop/electron/main/ipc-helpers.ts`
  - `packages/desktop/electron/main/ipc-server.ts` (streaming channels)
  - `packages/desktop/electron/main/{activity,bootstrap-drafts,ingest,quick-check,subagent}-channel.ts`

## Acceptance Criteria

### URL allowlist

- [ ] `isAllowedExternalUrl(input)` in
      `packages/core/src/types/url-allowlist.ts` returns true only
      when `new URL(input).protocol` is `http:` or `https:`. Never
      throws.
- [ ] Exported from `@praxis/core/types`.
- [ ] `praxis.shell.openExternal` handler calls `isAllowedExternalUrl`
      (regex removed; no `/^https?:\/\//i` anywhere in the handler).
- [ ] `UpdateFeedSchema.downloadUrl` uses
      `.refine(isAllowedExternalUrl, "downloadUrl must be http(s)")`
      (regex removed); same for `releaseNotesUrl`.
- [ ] Unit tests in
      `packages/core/src/types/__tests__/url-allowlist.test.ts`
      cover the bullet list under "Unit 3" in the parent feature body.

### Channel migration

- [ ] Each listed channel is wrapped in `wrapEnvelope(channel, log, ...)`.
- [ ] Each channel with non-trivial input (everything except
      `praxis.update.checkLatest`) is wrapped in
      `withSchema(s, ...)` with a co-located Zod schema.
- [ ] `praxis.config.setLockCode` / `praxis.lock.setLockCode` /
      `praxis.lock.unlock` / `praxis.lock.clearLock` reject
      `{ code: "" }`, `{ code: 123 }`, and any other shape via
      `VALIDATION_FAILED`.
- [ ] `praxis.shell.openExternal` returns
      `{ code: 'VALIDATION_FAILED' }` on a `file://` or
      `javascript:` input.
- [ ] Internal throws inside a migrated handler do not leak the
      original `Error.message` to the renderer — they surface as
      `code: 'INTERNAL', message: 'An internal error occurred',
      requestId`.
- [ ] Migrated client-side methods in `@praxis/client` use
      `unwrapEnvelope` and throw `IpcError` on failure.

### Redactor wiring

- [ ] No `serializeError(err)` call survives in any IPC main-process
      error log path. Verified by:
      `grep -rn 'serializeError(' packages/desktop/electron/main`
      returning only `serializeErrorRedacted` matches plus the
      original `serializeError` symbol (still imported only by
      `ipc-error-envelope.ts` if needed).
- [ ] A regression test in
      `packages/desktop/electron/main/__tests__/logger.test.ts` (or
      a new sibling test file) throws an `Error("apiKey=sk-ant-fake-…")`
      through the wrapped IPC handler and asserts the captured log
      record's `err.message` contains `[REDACTED]` and not the
      literal `sk-ant-fake-`.

### Integration tests

- [ ] New
      `packages/desktop/electron/main/__tests__/ipc-server.envelope-migration.test.ts`
      covers:
  - migrated channel success path returns envelope shape
  - migrated channel validation failure returns
    `code: 'VALIDATION_FAILED'`
  - migrated channel internal throw returns
    `code: 'INTERNAL'` with no path leakage in `message`
  - non-migrated control channel (`praxis.documents.list` for
    example) still throws raw — proves rollout is incremental.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` green at repo root.
- `pnpm --filter @praxis/core test` green.
- `pnpm --filter @praxis/desktop test` green.
- Manual smoke: `pnpm dev` boots the desktop app; settings page
  loads (engineConfig-shape changes from the parallel story should
  not be required for this story to typecheck — `praxis.config.engineConfig`
  is the other story's responsibility); shell.openExternal still
  opens https URLs and now rejects `file://` with a structured
  envelope error visible in the renderer console.

## Sequencing note

`depends_on:` only the envelope/redactor foundation story. Runs in
parallel with the engineConfig-shape story (no file overlap). When
both finish, the parent feature can advance to `review`.
