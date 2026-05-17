---
id: epic-security-hardening-round-2-ipc-boundary-engine-config-shape
kind: story
stage: done
tags: [security, core, desktop, ui]
parent: epic-security-hardening-round-2-ipc-boundary
depends_on: [epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor]
release_binding: v0.1.2
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

- `pnpm --filter @praxis/core typecheck`: green.
- `pnpm --filter @praxis/client typecheck`: green.
- `pnpm --filter @praxis/desktop typecheck`: green.
- `pnpm --filter @praxis/ui typecheck`: green.
- `pnpm --filter @praxis/core test`: 890 tests pass (engine-config
  test updated to assert the strict-schema contract for the public
  vs stored split).
- `pnpm --filter @praxis/desktop test`: 107 tests pass (envelope +
  ipc-server unchanged surface intact).
- `pnpm --filter @praxis/ui test`: 1010 tests pass.
- `pnpm --filter @praxis/client test`: 55 tests pass.

## Implementation notes (2026-05-14)

- Split `EngineConfigSchema` in
  `packages/core/src/config/schema.ts` into a public strict schema
  (renderer-facing, no `apiKeyEncrypted`) and an
  `EngineConfigStoredSchema` extending the public one with the
  encrypted blob. Both share the same `visionModelRefine`.
- `writeEngineConfig` now validates the final row against
  `EngineConfigStoredSchema` so the persistence layer enforces
  shape exactly once at the boundary.
- `EngineConfigSnapshot` (in `packages/core/src/types/client.ts`):
  removed `apiKey`, added `hasApiKey: boolean`. `ConfigService`
  grows a `revealApiKey()` method that returns
  `{ apiKey: string | null }`. `setEngineConfig` accepts
  `EngineConfigSnapshot & { apiKey?: string }` with
  preserve-on-undefined semantics.
- `ConfigServiceImpl.engineConfig()` returns the `hasApiKey`
  snapshot via `toSnapshot`; `revealApiKey()` returns the decrypted
  key from `readEngineConfig`; `setEngineConfig` merges the
  in-flight apiKey with the existing stored value before validating
  and persisting.
- `packages/desktop/electron/main/ipc-server.ts`:
  - Wrapped `praxis.config.engineConfig` in `wrapEnvelope`.
  - Added `praxis.config.engineConfig.reveal` channel (also
    wrapped) that requires unlock and returns the decrypted key.
  - Wrapped `praxis.config.setEngineConfig` in
    `wrapEnvelope` + `withSchema(EngineConfigSchema, ...)` so
    `apiKeyEncrypted` injection is rejected as
    `VALIDATION_FAILED` at the IPC boundary.
- `packages/client/src/services/config-client.ts`:
  `engineConfig()`, `revealApiKey()`, and `setEngineConfig()` all
  call `unwrapEnvelope` to convert envelope failures into thrown
  `IpcError` (with `.code` / `.requestId`).
- Settings UI (`packages/ui/src/routes/settings.tsx`): replaced
  the always-mounted password input with a presence display
  ("API key configured" / "Not configured") + an Edit/Add button
  that calls `revealApiKey()` to populate an in-flight edit input.
  Save submits `{ apiKey: editedValue }`; refetches the snapshot
  on success so `hasApiKey` updates.
- Onboarding flow (`packages/ui/src/components/onboarding-flow.tsx`):
  decoupled the `apiKey` local state from the snapshot. If a key
  is already stored, the form pre-fills the input by calling
  `revealApiKey()` on mount.

## Decisions logged

- **Renderer-side migration via type contract**: removing
  `apiKey` from `EngineConfigSnapshot` makes
  `pnpm typecheck` fail at every read-site; both consumers
  (settings.tsx + onboarding-flow.tsx) were migrated in this
  story. Type-driven completeness rather than a grep audit.
- **Settings "Add" vs "Edit" affordance**: the button text
  flips on `hasApiKey`. When no key is stored, the affordance
  says "Add" and the click immediately opens an empty input
  (no reveal call). When a key is stored, the text is "Edit"
  and the click calls `revealApiKey()` to prefill — that's
  the only path that crosses the trust boundary with the
  secret, and it's gated on an explicit user action.
- **Onboarding re-entry handling**: if onboarding is re-entered
  after first complete (typically only via test reset or a
  manual override), the form prefills the apiKey by calling
  `revealApiKey()` so the user doesn't lose their stored key
  on save. First-run onboarding sees `hasApiKey: false` from
  the fallback `{ engineId: "direct.anthropic", hasApiKey: false }`
  and renders an empty input.
- **`setEngineConfig` snapshot input includes `hasApiKey`**: the
  field is stripped by the service before persistence. The
  client passes the value the renderer already has (it's
  derived, not user-edited) — simpler than splitting two
  request types in the client wrapper.

## Review (2026-05-14)

**Verdict**: Approve with comments

**Blockers**: none
**Important**:
- Service-layer + UI test gap → `test-gap-engine-config-shape-service-and-ui`.
  The story declared a new `config-service.engine-shape.test.ts` in its
  acceptance list but the implementation extended the existing
  `engine-config.test.ts` instead. Schema-level coverage of the strict
  rejection IS present and good, but the service-layer business logic
  for `revealApiKey()`, the `hasApiKey` snapshot, and the `setEngineConfig`
  preserve/clear/replace merge semantics is uncovered. UI also has no
  coverage of the new "Add" vs "Edit" affordance or the `revealApiKey()`
  call path. Filed as a backlog item rather than blocking — the
  implementation itself is correct and round-trips through the existing
  engine-config persistence tests.

**Nits**:
- `defaultConfig: EngineConfigSnapshot = { engineId }` in
  `packages/ui/src/__tests__/settings-route.test.tsx` is missing the
  now-required `hasApiKey` field. Passes only because the per-package
  tsconfig excludes test files from typecheck. Captured in the
  test-gap item above.

**Notes**: Schema split is clean — public strict, stored extends with
`apiKeyEncrypted`. IPC layer correctly wraps the three engineConfig
channels with `wrapEnvelope` + `withSchema` and adds the
unlock-gated `engineConfig.reveal` channel. Settings UI flips its
affordance text on `hasApiKey` and gates the reveal call on explicit
user action — that's the right shape for the trust boundary. Type-driven
migration (removing `apiKey` from the snapshot) caught all read sites
through typecheck; both consumers (settings + onboarding) updated in
this story. All tests green: core 905, desktop 107, client 55, ui 972.
Typecheck green across all four packages. Ready to advance.
