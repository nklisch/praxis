---
id: epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor
kind: story
stage: implementing
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

- `pnpm --filter @praxis/desktop test` green for the new
  `ipc-error-envelope.test.ts`.
- `pnpm --filter @praxis/core test` green for the new
  `errors.test.ts`.
- `pnpm typecheck && pnpm lint` green at the repo root.
- No existing call-site of `serializeError` or any IPC handler has
  changed behavior (verify by running the full repo test suite —
  nothing should fail because nothing yet imports the new helpers).
