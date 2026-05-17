---
id: epic-security-hardening-round-2
kind: epic
stage: done
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Security hardening round 2 — close the gate findings from v0.1.1

## Brief

The first security hardening epic (`epic-v1-security-hardening`, released in
v0.1.1) closed the two findings that blocked shipping: encrypt the API key at
rest, and sign the update feed. The v0.1.1 quality-gate run surfaced **seven
additional Low-severity findings** during the same scan that produced the
release blockers. Each is bounded, none individually justifies a feature, but
together they form a coherent "tighten the desktop trust boundary" arc — IPC
input validation, error-message leakage, secret scrubbing in logs, URL
parsing for shell handoffs, MCP socket perms, and a defensive-guard gap in
the embedded image store.

This epic absorbs those seven gate items as one round, so we can land them in
parallel waves under a single design pass instead of seven scattered stories
trickling through the queue. They share three substrates — `ipc-server.ts`
(four of seven touch it), the IPC error shape, and the secret-redaction
helper — which makes a unified design noticeably cheaper than seven solo
designs.

## Scope absorbed from backlog

All seven `gate-security-*` items in `.work/backlog/`, produced by the v0.1.1
security gate run. Each carries its own evidence block, severity rationale,
and a suggested fix:

- `gate-security-embedded-image-store-dirfor-guard` — defensive guard inside
  `FsEmbeddedImageStore.dirFor` / `FsPageImageStore.dirFor` against path
  traversal via the synthetic `_pending_<uuid>` doc id channel.
- `gate-security-engine-config-plaintext-api-key` — `praxis.config.engineConfig`
  returns the decrypted apiKey plaintext to the renderer; renderer doesn't
  need the secret value, only its presence/shape.
- `gate-security-ipc-handler-error-leak` — IPC handlers re-throw raw `Error`
  objects so internal stack/message strings cross the trust boundary into
  the renderer.
- `gate-security-logger-pattern-secret-scrubber` — logger drains the raw
  `err` field that has not been pattern-redacted; the redactor exists but
  isn't applied on the error path.
- `gate-security-open-external-url-parse` — `praxis.shell.openExternal`
  URL allowlist uses a prefix regex instead of `new URL(...)` parsing,
  which is bypassable.
- `gate-security-set-engine-config-strict-schema` — `setEngineConfig` IPC
  accepts `unknown`; the encrypted-blob field leaks into the public schema
  shape.
- `gate-security-tool-socket-perms-and-token` — MCP tool-bridge Unix-domain
  socket has neither explicit permission bits nor an auth token; any
  process on the same machine can connect.

## Anchors (current implementation)

- IPC server — `packages/desktop/electron/main/ipc-server.ts` (four of seven
  findings live here)
- IPC helpers / error shape — `packages/desktop/electron/main/ipc-helpers.ts`
- Engine config service — `packages/core/src/services/config-service.ts`,
  `packages/core/src/config/engine-config.ts`, `packages/core/src/config/schema.ts`
- Secret redactor — `packages/core/src/types/errors.ts`
- Embedded image stores — `packages/core/src/ingestion/embedded-images.ts`,
  `packages/tools/src/runtime/ingestion/{pptx,docx}-ingestor.ts`
- Tool bridge socket — `packages/claude-cli-sdk/src/tool-server.ts`

## Why now

These were all triaged Low at v0.1.1 release time and deferred — none
blocked ship, but they accumulate defense-in-depth debt and are easy to
forget once the team's attention moves on. Bundling them now while the
context is still fresh costs less than triaging them individually six
months from now when the surrounding code has drifted.

## Decomposition

Split by trust-boundary substrate. The five IPC-boundary items share the
`ipc-server.ts` / `ipc-helpers.ts` substrate and a common
input-schema + output-shape + error-envelope design, so they collapse
into one feature. The tool-bridge socket lives in
`@praxis/claude-cli-sdk` with a different transport and threat model.
The image-store guard is in the ingestion subsystem and shares nothing
with the other two. The three features are fully independent — autopilot
can run them as one wave.

### Child features

- `epic-security-hardening-round-2-ipc-boundary` — strict request
  schemas, sanitized error envelopes, secret-scrubbed log fields, and
  the apiKey-shape-leak fix on the renderer response — depends on: `[]`
- `epic-security-hardening-round-2-tool-bridge-socket-auth` — 0600
  socket perms + per-session auth token over the MCP tool-bridge —
  depends on: `[]`
- `epic-security-hardening-round-2-image-store-path-guard` —
  defensive `dirFor` validation against path-traversal via tainted
  doc ids — depends on: `[]`

### Decomposition risks

- **`engine-config-plaintext-api-key` is a renderer-side contract
  change** — removing apiKey from the engineConfig response may break
  renderer code that reads the field. Feature-design must verify no UI
  surface needs the decrypted value (configure screen probably only
  needs "is a key set?").
- **Strict schemas at the IPC boundary may break in-flight clients** —
  every IPC handler that adds Zod validation needs paired client-side
  changes. The IPC-boundary feature should roll out per-channel rather
  than as a sweeping refactor.
- **Tool socket auth changes the SDK contract** —
  `@praxis/claude-cli-sdk` is owned in-tree but every consumer
  (currently just Praxis) needs the matching token-passing path. Land
  the SDK side first, then flip the consumer.
- **The IPC-boundary feature is the largest** — five items, ~10
  implementation units. Feature-design should consider whether it wants
  to split into "input validation" and "output / error sanitization"
  sub-tracks at that level. Keeping it as one feature here so the
  shared design pass happens together.

## Review (2026-05-14)

**Verdict**: Approve

All three child features landed cleanly:
- `epic-security-hardening-round-2-ipc-boundary` — done (5 of 7 gate
  items absorbed; 3 child stories all reviewed and merged)
- `epic-security-hardening-round-2-tool-bridge-socket-auth` — done
- `epic-security-hardening-round-2-image-store-path-guard` — done

Epic delivered as briefed. All seven `gate-security-*` backlog
items from the v0.1.1 quality-gate run are now either implemented
or archived as absorbed: `ipc-handler-error-leak`,
`logger-pattern-secret-scrubber`, `engine-config-plaintext-api-key`,
`set-engine-config-strict-schema`, `open-external-url-parse`
(absorbed by the ipc-boundary feature in this drain),
`tool-socket-perms-and-token`, and
`embedded-image-store-dirfor-guard` (absorbed by their respective
features in earlier drains).

The trust boundary is now consistently typed: renderer-bound
envelopes carry only user-safe codes; the renderer never sees
plaintext API keys at steady state; URL allowlists use WHATWG
parsing; log payloads run through pattern-based secret redaction.

Two test-gap items filed during the IPC-boundary feature review
(`test-gap-engine-config-shape-service-and-ui`,
`test-gap-ipc-envelope-migration-integration`) are coverage-
completeness items, not invariant failures.

Children: 3/3 done. Ready to advance.
