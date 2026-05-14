---
id: epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor
kind: story
stage: done
tags: [security, desktop, core]
parent: epic-security-hardening-round-2-ipc-boundary
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# IPC envelope helper + pattern-based secret redactor

## Scope

Foundation story for the IPC-boundary hardening feature. Lands the two
shared helpers that the rest of the feature builds on:

1. The sanitized error envelope (`IpcEnvelope<T>`, `wrapEnvelope`,
   `withSchema`, client-side `IpcError` + `unwrapEnvelope`).
2. The pattern-based secret redactor in `@praxis/core/types/errors.ts`
   (`redactSecrets`, `serializeErrorRedacted`).

Pure addition. No channel uses these helpers yet — that wiring lands
in the URL/rollout story. No production behavior change after this
story.

## Units in this story

- Unit 1: IPC error envelope + per-channel wrapper
  - File: `packages/desktop/electron/main/ipc-error-envelope.ts` (new)
  - File: `packages/client/src/transport/envelope.ts` (new)
- Unit 2: Pattern-based secret redactor
  - File: `packages/core/src/types/errors.ts` (extend existing)

See the parent feature body for the full type signatures and design
notes (`.work/active/features/epic-security-hardening-round-2-ipc-boundary.md`).

## Acceptance Criteria

### Envelope helper

- [ ] `wrapEnvelope(channel, log, fn)` catches all throws; the IPC
      promise it returns never rejects — failure is surfaced as
      `{ ok: false, error: {...} }`.
- [ ] `ZodError` → `code: 'VALIDATION_FAILED'`, `message` is the joined
      `issue.path` (never raw Zod text).
- [ ] Unknown error → `code: 'INTERNAL'`, `message: "An internal error
      occurred"`. The original `message`/`stack` is logged with the same
      `requestId` on the main side via `serializeErrorRedacted` and
      never crosses the wire.
- [ ] Every failure carries a `requestId` (UUIDv7) that appears both
      on the wire envelope and in the main-process error log line.
- [ ] `withSchema(schema, fn)` validates `raw → parsed` with Zod and
      throws `ZodError` on mismatch (so `wrapEnvelope` maps it).
- [ ] `unwrapEnvelope` on `{ ok: true, value }` returns `value`.
- [ ] `unwrapEnvelope` on `{ ok: false, error }` throws an `IpcError`
      with `.code` and `.requestId`.
- [ ] `unwrapEnvelope` on a non-envelope result passes it through
      unchanged (so the rollout can be partial).
- [ ] Unit tests under
      `packages/desktop/electron/main/__tests__/ipc-error-envelope.test.ts`
      cover every bullet above (see parent feature body for the test
      list).

### Pattern redactor

- [ ] `redactSecrets(input)` redacts:
  - provider key prefixes (`sk-…`, `xai-…`, `gsk_…`)
  - bearer tokens (`Bearer <token>`)
  - JWT-shaped strings (three base64url segments separated by `.`)
  - URL-embedded `?key=…` / `&authorization=…` query-param values
- [ ] `redactSecrets` is pure (no logger / no side effects) and lives
      in `@praxis/core/types/errors.ts` next to `serializeError`.
- [ ] `serializeErrorRedacted(err)` returns a `SerializedError` whose
      `message` and `stack` have been run through `redactSecrets`.
- [ ] Unit tests under `packages/core/src/types/__tests__/errors.test.ts`
      cover both helpers (see parent feature body for the test list).

## Verification

- `pnpm --filter @praxis/desktop test` green: 107 tests, including the
  new `ipc-error-envelope.test.ts` (15 tests).
- `pnpm --filter @praxis/core test` green: 889 tests, including the
  extended `errors.test.ts` (29 tests covering both
  `redactSecrets` and `serializeErrorRedacted` plus the original
  `serializeError` set).
- `pnpm --filter @praxis/client test` green: 55 tests, including the
  new `envelope.test.ts` (7 tests).
- Typecheck green on core, desktop, client, ui.

## Implementation notes (2026-05-14)

**Pure addition.** No channel uses these helpers yet — the next two stories
(engineConfig-shape, url-and-redactor-rollout) consume them.

- Extended `packages/core/src/types/errors.ts` with `redactSecrets(input)`
  and `serializeErrorRedacted(err)`. Patterns are declared as a `const`
  tuple at the top of the module so review-time additions are obvious.
- Updated `packages/core/src/types/index.ts` to re-export the two new
  runtime helpers alongside `serializeError`.
- Created `packages/desktop/electron/main/ipc-error-envelope.ts` with:
  - `IpcEnvelope<T>` / `IpcEnvelopeError` / `IpcErrorCode`
  - `wrapEnvelope(channel, log, fn)` — never rejects; resolves the IPC
    promise with a discriminated union. Logs the original error with
    a `requestId` via `serializeErrorRedacted` so file-transport logs
    never see literal provider keys.
  - `toEnvelopeError(err, requestId)` — exported for tests; maps
    ZodError → VALIDATION_FAILED (joined path, never raw message),
    allowlisted error codes → INTERNAL with the code stashed in the
    user-safe message, everything else → INTERNAL with a generic
    "An internal error occurred".
  - `withSchema(schema, fn)` — composes with `wrapEnvelope` for
    per-channel input validation.
- Created `packages/client/src/transport/envelope.ts` with `IpcError`
  + `unwrapEnvelope`. The envelope type is declared structurally
  (not imported from desktop) to keep the client → desktop dependency
  one-directional. `unwrapEnvelope` passes through non-envelope values
  unchanged so the rollout can be partial.

## Decisions logged

- **Allowlisted error codes (envelope.ts)**: `unavailable`,
  `decryption_failed`, `invalid_secret`, `locked`, `NOT_FOUND`,
  `NOT_AUTHORIZED`, `CONFIG_INVALID`. These surface in the
  user-safe envelope message as `An internal error occurred (<code>)`
  so support can ask "what code did you see?" without exposing the
  full stack. Codes outside the allowlist are folded into the
  generic message — feature-design's "internal stacks never cross
  the wire" invariant.
- **Zod error path resolution**: `path.join(".")` joined with dots,
  with `(root)` used when the path array is empty. The first issue
  wins; multi-issue validation surfaces only the first issue's path.
  Acceptable for the gates this story enables; multi-issue UX is a
  future enhancement.
- **JWT regex**: requires a minimum of 8 characters per base64url
  segment to avoid false positives on short dotted strings like
  "a.b.c". The chosen replacement string is `[REDACTED_JWT]` (not
  just `[REDACTED]`) so log triage can still tell it was a JWT-shaped
  redaction vs a Bearer / provider-key redaction.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `isEnvelope` in `packages/client/src/transport/envelope.ts` could
  collapse the two branches using a single `ok ∈ {true, false}` guard,
  but the explicit form is more readable. Keep as-is.

**Notes**: Clean foundation. 51 tests across three packages all green
(15 envelope + 29 errors + 7 client envelope), typecheck green, no
production behavior change (pure addition; rollout lands in the
URL/redactor-rollout story). ZodError duck-typing is the right call —
avoids binding the envelope module to a Zod major version. Provider-key
prefix preservation in `redactSecrets` is good for log triage. Ready
to advance.
