---
id: epic-security-hardening-round-2
kind: epic
stage: drafting
tags: [security]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
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

## Decomposition direction (for epic-design)

Likely splits into 3–4 child features:

- **IPC trust-boundary hardening** — strict request schemas, sanitized
  error responses, secret-scrubbed log fields. (Absorbs
  `ipc-handler-error-leak`, `logger-pattern-secret-scrubber`,
  `set-engine-config-strict-schema`, `engine-config-plaintext-api-key`,
  `open-external-url-parse`.)
- **Tool-bridge socket auth** — socket perms + per-session token.
  (Absorbs `tool-socket-perms-and-token`.)
- **Image-store path-traversal guard** — defensive validation in the
  shared `dirFor` helper. (Absorbs `embedded-image-store-dirfor-guard`.)

Epic-design will refine these boundaries — the IPC bundle is large enough
that splitting it further (input validation vs. output sanitization) is
worth considering during design.

## Decomposition risks

- **`engine-config-plaintext-api-key` is a renderer-side contract change** —
  removing apiKey from the engineConfig response may break renderer code
  that reads the field. Verify no UI surface needs the decrypted value
  before changing the shape (configure screen probably only needs "is a
  key set?").
- **Strict schemas at the IPC boundary may break in-flight clients** —
  every IPC handler that adds Zod validation needs paired client-side
  changes. Roll out per-channel rather than as a sweeping refactor.
- **Tool socket auth changes the SDK contract** — `@praxis/claude-cli-sdk`
  is owned in-tree but every consumer (currently just Praxis) needs the
  matching token-passing path. Land the SDK side first, then flip the
  consumer.
