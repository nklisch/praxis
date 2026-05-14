---
id: gate-security-streaming-channel-error-push-redactor-gap
kind: story
stage: done
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: security
created: 2026-05-14
updated: 2026-05-14
---

# Streaming IPC channels push unredacted error messages to renderer

## Severity
High

## Domain
Data Protection

## Location
- `packages/desktop/electron/main/ipc-server.ts:163`, `:475`, `:1133`
- `packages/desktop/electron/main/activity-channel.ts:59`
- `packages/desktop/electron/main/bootstrap-drafts-channel.ts:83`
- `packages/desktop/electron/main/ingest-channel.ts:180`
- `packages/desktop/electron/main/quick-check-channel.ts:59`
- `packages/desktop/electron/main/subagent-channel.ts:62`

## Evidence
```ts
} catch (err) {
  streamLog.error("activity.error", { err: serializeErrorRedacted(err) });
  push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
}
```

The security-hardening epic explicitly updated the logger sites to
`serializeErrorRedacted(err)` (so file logs are scrubbed of API keys,
Bearer tokens, JWTs, URL-embedded secrets), but every
`push({ kind: "error", error: ... })` immediately below it still ships the
**raw** `err.message` over the IPC stream to the renderer. The redactor
only protects logs, not the wire. Any provider rejection, decryption
failure, or downstream error whose message includes a `sk-ant-` /
`Bearer` / `?key=` substring lands verbatim in the renderer's error
event. This is a gap in the IPC-boundary-redactor security work in
v0.1.2 — in the same files the epic modified.

## Remediation direction

Pipe the user-facing string through `redactSecrets(...)` (already
exported from `@praxis/core/types`) before each
`push({ kind: "error", error })` call, or move streaming channels onto an
envelope-like `{ ok: false, error: { code, message } }` shape that maps
unknown errors to a generic message the same way `wrapEnvelope` already
does for invoke-style handlers.

## Implementation

All 8 `push({ kind: "error", error: ... })` call sites across the 6 channel files are now wrapped with `redactSecrets(...)`. The import `redactSecrets` was added alongside the existing `serializeErrorRedacted` import in each file.

### Sites modified

- `packages/desktop/electron/main/ipc-server.ts:163` — session.send stream
- `packages/desktop/electron/main/ipc-server.ts:475` — memory.episodic stream
- `packages/desktop/electron/main/ipc-server.ts:1133` — auth.claude.login stream
- `packages/desktop/electron/main/activity-channel.ts:59` — activity.events stream
- `packages/desktop/electron/main/bootstrap-drafts-channel.ts:83` — bootstrap.drafts stream
- `packages/desktop/electron/main/ingest-channel.ts:180` — ingest stream
- `packages/desktop/electron/main/quick-check-channel.ts:59` — quickCheck.events stream
- `packages/desktop/electron/main/subagent-channel.ts:62` — subAgent.events stream

### Import added (per file)

`redactSecrets` added to the existing `@praxis/core/types` import in all six files. `ipc-server.ts` already had the value import line; the other five each had `serializeErrorRedacted` already and gained `redactSecrets` alongside it.

### Verification

- `pnpm --filter @praxis/desktop typecheck` — passed
- `pnpm typecheck` — passed (all 10 packages)
- `pnpm --filter @praxis/desktop test` — 122 tests passed, 0 failed

## Review (2026-05-14)

Verdict: **Approve**

### Security correctness

Uniformity check passed. `grep -n 'push({ kind: "error"' packages/desktop/electron/main/*.ts | grep -v redactSecrets` returns zero results. Every one of the 8 push sites is wrapped:

- `ipc-server.ts` lines 163, 475, 1133 — session.send, memory.episodic, auth.claude.login streams
- `activity-channel.ts` line 59
- `bootstrap-drafts-channel.ts` line 83
- `ingest-channel.ts` line 180
- `quick-check-channel.ts` line 56
- `subagent-channel.ts` line 62

`redactSecrets` is imported in all 6 files alongside the existing `serializeErrorRedacted`. The function is exported from `packages/core/src/types/errors.ts` (line 85) and re-exported from `packages/core/src/types/index.ts` (line 58) — the canonical `@praxis/core/types` import path.

### No regression in error reporting

The pattern `redactSecrets(err instanceof Error ? err.message : String(err))` is correct: the full message propagates to the renderer after scrubbing only secret-shaped substrings. Non-secret errors pass through unmodified.

### Tests

Re-ran `pnpm --filter @praxis/desktop test` — 128 tests passed, 0 failed. Count is 128 (not 122 from the implementation note) because the paired `streaming-channel-error-redaction.test.ts` (6 tests) landed as part of a follow-up commit after the implementation note was written. All 6 new tests pass.

### Sibling cleanup

The follow-up commit (`b675863`) fixed a biome line-length violation in `quick-check-channel.ts` introduced by this commit — the push call is now formatted as a multi-line object. The change is cosmetic only; the `redactSecrets(...)` wrapping is intact. Noted, not penalized.

### No blockers

All 8 push sites are redacted. No missed sites found.
