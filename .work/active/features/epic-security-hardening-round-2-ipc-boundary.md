---
id: epic-security-hardening-round-2-ipc-boundary
kind: feature
stage: drafting
tags: [security]
parent: epic-security-hardening-round-2
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# IPC trust-boundary hardening

## Brief

The Electron IPC boundary between the main process (full Node + DB +
secrets) and the renderer (untrusted UI) is the single most security-
relevant surface in Praxis. Five of the seven `gate-security-*` findings
land directly on this boundary. This feature bundles them into one design
pass because they share three substrates — the IPC handler scaffold in
`ipc-helpers.ts`, the error-envelope shape that crosses the boundary, and
the secret-redaction helper in `core/types/errors.ts` — and designing them
together avoids five overlapping per-finding designs.

The five items each correspond to a different category of boundary leak:
**input shapes** that aren't validated before hitting service code
(`setEngineConfig`), **output shapes** that include secret material the
renderer doesn't need (`engineConfig` returns plaintext apiKey), **error
envelopes** that leak internal stack/message strings, **log payloads** that
drain unredacted secret material on the error path, and **URL allowlists**
that use prefix regex instead of WHATWG URL parsing for shell handoffs.
Together they harden every direction data crosses the boundary.

This feature does NOT cover the tool-bridge Unix socket (separate feature
— different transport, different threat model) or the image-store path
guard (separate feature — different subsystem, no IPC overlap).

## Epic context

- Parent epic: `epic-security-hardening-round-2`
- Position in epic: largest feature, contains the IPC-boundary cluster.
  Independent of the other two features in this epic — runs in parallel.

## Scope absorbed from backlog

Five items in `.work/backlog/`:

- `gate-security-set-engine-config-strict-schema` — `setEngineConfig`
  IPC accepts `unknown`; the encrypted-blob field leaks into the public
  schema shape.
- `gate-security-engine-config-plaintext-api-key` —
  `praxis.config.engineConfig` returns the decrypted apiKey plaintext to
  the renderer; renderer needs presence/shape, not the secret value.
- `gate-security-ipc-handler-error-leak` — IPC handlers re-throw raw
  `Error` objects so internal stack/message strings cross the trust
  boundary.
- `gate-security-logger-pattern-secret-scrubber` — logger drains the raw
  `err` field that has not been pattern-redacted; the redactor exists
  but isn't applied on the error path.
- `gate-security-open-external-url-parse` —
  `praxis.shell.openExternal` URL allowlist uses a prefix regex instead
  of WHATWG `new URL(...)` parsing.

## Foundation references

- `docs/ARCHITECTURE.md` — IPC trust boundary, main/renderer split,
  channel naming conventions
- `docs/SPEC.md` — IPC contract shape, error envelope expectations
- `CLAUDE.md` — pattern `ipc-channel-convention`

## Anchors (current implementation)

- IPC handler scaffold — `packages/desktop/electron/main/ipc-helpers.ts`
  (the `handle(channel, fn)` wrapper that all IPC handlers use)
- IPC server — `packages/desktop/electron/main/ipc-server.ts` (the
  ~60-channel surface; four of five findings live here)
- Config service — `packages/core/src/services/config-service.ts`
  (engineConfig getter; apiKey decryption path)
- Config schema — `packages/core/src/config/schema.ts` (the Zod schema
  exposed in the public engineConfig response)
- Engine config encryption — `packages/core/src/config/engine-config.ts`
- Secret redactor — `packages/core/src/types/errors.ts` (the pattern-based
  scrubber that isn't currently applied to the err field)
- Client-side IPC consumer — `packages/client/src/services/` (will need
  matching changes if response shapes tighten)

## Pre-design decisions (2026-05-14)

- **`engineConfig` response shape**: presence boolean only.
  `praxis.config.engineConfig` returns `{ hasApiKey: boolean, engineId,
  ... }` after this feature. Renderer never sees the secret. The
  decrypted value stays main-process-only. Implementation must audit
  existing renderer code that reads `apiKey` and migrate to
  `hasApiKey` semantics.
- **Sanitized error envelope**: `{ code: 'VALIDATION_FAILED' |
  'INTERNAL' | ..., message: 'user-safe text', requestId: '...' }`.
  Categories are an enum we own; the IPC-helpers wrapper maps thrown
  errors to envelopes. Renderer drives structured UX off `code`; logs
  cross-reference via `requestId`. Internal stacks/messages are
  scrubbed by the logger redactor on the main side and never cross.
- **Roll-out**: per-channel migration, not a sweeping wrapper change.
  Each handler tightens its request schema and adopts the envelope
  shape one at a time; paired client-side changes ship together.
