---
id: epic-security-hardening-round-2-ipc-boundary-engine-config-shape
kind: story
stage: implementing
tags: [security, core, desktop, ui]
parent: epic-security-hardening-round-2-ipc-boundary
depends_on: [epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor]
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# engineConfig response shape: hasApiKey + reveal channel

## Scope

The renderer-contract-changing story in this feature. After this
story:
- `praxis.config.engineConfig` returns `{ engineId, hasApiKey, model?,
  baseUrl?, effort? }` — no plaintext `apiKey` field.
- A new `praxis.config.engineConfig.reveal` channel returns
  `{ apiKey: string | null }` for the edit flow (requires unlock).
- `EngineConfigSchema` is split into the public (strict, no
  `apiKeyEncrypted`) schema and a sibling `EngineConfigStoredSchema`
  that adds the encrypted blob for persistence-layer use.
- Settings and onboarding UI surfaces are updated to consume
  `hasApiKey` for display and `revealApiKey()` for the edit flow.
- The `setEngineConfig` IPC handler validates with the strict public
  schema via `withSchema`, returning a `VALIDATION_FAILED` envelope
  on `apiKeyEncrypted` injection attempts.

## Units in this story

- Unit 4 from the parent feature design (full list of files +
  signatures there):
  - `packages/core/src/config/schema.ts` — split into public +
    stored schemas; `.strict()` the public one.
  - `packages/core/src/config/engine-config.ts` — write-path uses
    the stored schema; read-path returns a presence indicator.
  - `packages/core/src/types/client.ts` — `EngineConfigSnapshot`
    drops `apiKey`, gains `hasApiKey: boolean`; `ConfigService` adds
    `revealApiKey()`; `setEngineConfig` arg type allows optional
    `apiKey`.
  - `packages/core/src/services/config-service.ts` — `toSnapshot`
    returns `hasApiKey`; `revealApiKey()` method; `setEngineConfig`
    preserves stored key when `apiKey === undefined`.
  - `packages/desktop/electron/main/ipc-server.ts` — add
    `praxis.config.engineConfig.reveal`; switch `setEngineConfig`
    to `wrapEnvelope` + `withSchema`; `engineConfig` and
    `setEngineConfig` use `wrapEnvelope`.
  - `packages/client/src/services/config-client.ts` — add
    `revealApiKey` method; switch the three migrated config
    methods to `unwrapEnvelope`.
  - `packages/ui/src/routes/settings.tsx` — display "configured /
    not configured"; edit flow calls `revealApiKey()`.
  - `packages/ui/src/components/onboarding-flow.tsx` — same shape
    update; pre-fill via `revealApiKey()` if reusing a stored key.

## Acceptance Criteria

### Schema split

- [ ] `EngineConfigSchema` no longer declares `apiKeyEncrypted`.
- [ ] `EngineConfigSchema` is `.strict()` — unknown keys rejected.
- [ ] `EngineConfigStoredSchema` extends the public schema with the
      `apiKeyEncrypted` field; used only by `writeEngineConfig` /
      `readEngineConfig`.
- [ ] `EngineConfig` type exported from `schema.ts` is the *public*
      shape; `EngineConfigStored` is exported alongside.

### Snapshot + service

- [ ] `EngineConfigSnapshot.apiKey` field removed; `hasApiKey: boolean`
      added.
- [ ] `ConfigService.revealApiKey(): Promise<{ apiKey: string | null }>`
      added to the interface.
- [ ] `ConfigServiceImpl.engineConfig()` returns `hasApiKey: true`
      iff the resolved (stored OR env-override) config has a
      non-empty `apiKey`; otherwise `false`.
- [ ] `ConfigServiceImpl.engineConfig()` response object never has
      an `apiKey` property (verify via Object key absence in tests).
- [ ] `ConfigServiceImpl.revealApiKey()` returns the decrypted key
      when present, `null` when none stored.
- [ ] `ConfigServiceImpl.setEngineConfig(input)` — when `input.apiKey`
      is `undefined`, the stored encrypted blob is preserved; when
      `input.apiKey === ""`, the stored key is cleared; when
      `input.apiKey` is a non-empty string, it replaces the stored
      key (re-encrypted via `secretStorage`).

### IPC layer

- [ ] `praxis.config.engineConfig` is wrapped with `wrapEnvelope`
      and returns the `hasApiKey` snapshot.
- [ ] `praxis.config.engineConfig.reveal` exists, requires
      `requireUnlocked()`, returns `{ apiKey }` via envelope.
- [ ] `praxis.config.setEngineConfig` is wrapped with `wrapEnvelope`
      + `withSchema(EngineConfigSchema, ...)`. Passing
      `{ apiKeyEncrypted: "x" }` produces envelope
      `{ code: 'VALIDATION_FAILED', ... }`.

### Client + UI

- [ ] `ConfigClient.engineConfig()` returns the snapshot (via
      `unwrapEnvelope`); `ConfigClient.revealApiKey()` calls the
      reveal channel.
- [ ] `SettingsRoute` renders "API key configured" vs "Not
      configured" based on `hasApiKey`; the apiKey input populates
      only on explicit "edit" click (which calls `revealApiKey()`).
- [ ] `onboarding-flow.tsx` continues to function — call
      `revealApiKey()` on mount if reuse of an existing key is shown.
- [ ] All UI tests
      (`packages/ui/src/__tests__/settings-route.test.tsx`,
      `packages/ui/src/__tests__/onboarding-flow.test.tsx`,
      `packages/ui/src/__tests__/use-first-run.test.tsx`,
      `packages/ui/src/__tests__/use-bootstrap-budget.test.tsx`)
      updated for the new snapshot shape.

### Service-layer tests

- [ ] New
      `packages/core/src/services/__tests__/config-service.engine-shape.test.ts`
      covers the full list under "Unit 4" in the parent feature body.

## Verification

- `pnpm typecheck` green — the type change of `EngineConfigSnapshot`
  is load-bearing; the typechecker enforces that every renderer
  read site is migrated.
- `pnpm --filter @praxis/core test` green.
- `pnpm --filter @praxis/desktop test` green (ipc-server tests).
- `pnpm --filter @praxis/ui test` green.
- `pnpm --filter @praxis/client test` green — new reveal method
  has at least one channel-routing test.
- `pnpm lint` green.
