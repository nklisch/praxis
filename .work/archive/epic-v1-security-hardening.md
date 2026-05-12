---
id: epic-v1-security-hardening
kind: epic
stage: done
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
---

# V1 security hardening

## Brief

V0.1.0 shipped two security findings as deferred items rather than fixes — both
were documented (in `docs/UPDATE-CHANNEL.md` and the onboarding security text)
and parked. This epic delivers both. Each is a self-contained feature with its
own design considerations; the epic-design phase will split this into two child
features.

### Feature 1 — Encrypt API key at rest using Electron safeStorage

The Anthropic / OpenAI / Gemini API key currently lives as plaintext JSON in the
SQLite `config_kv` table. Any process on the same user account — backup tools,
synced cloud drives, malware — can read it directly. The finding from
`gate-security-api-key-cleartext-vs-onboarding-doc` was resolved for v0.1.0 by
fixing the documentation claim rather than adding encryption.

**Remediation direction.** Wrap the `apiKey` field in
`packages/core/src/config/engine-config.ts` with Electron's `safeStorage` API
before persisting and decrypt on read. `safeStorage.encryptString(apiKey)` stores
as a base64 blob in `config_kv`; `safeStorage.decryptString(blob)` decodes on
read. The platform keychain backs it (Keychain on macOS, DPAPI on Windows,
libsecret on Linux). Bounded change to `engine-config.ts`.

**Design considerations.**
- *Migration*: existing databases have plaintext keys. A one-time migration must
  detect and re-encrypt them on first startup; schema-version sentinel or a
  marker on the value can drive this.
- *safeStorage availability*: `safeStorage.isEncryptionAvailable()` may return
  false in some headless/CI environments. Need a fallback (warn, refuse to save,
  or accept plaintext with a logged warning).
- *Key rotation*: if the OS encryption key changes (reinstall, account
  migration), the stored blob becomes unreadable. Document the recovery path
  (re-enter API key in configure surface).
- *Testing*: safeStorage is an Electron API — unit tests mock it; add an
  integration smoke test in the desktop package.

Evidence:
```typescript
// engine-config.ts:36-47 — raw config object (apiKey field) JSON-stringified
db.insert(configKv)
  .values({ key: CONFIG_KEY, valueJson: validated, updatedAt: new Date() })
```

```typescript
// schema.ts:3-7 — value_json is plain text, no at-rest encryption
export const configKv = sqliteTable("config_kv", {
  key: text("key").primaryKey(),
  valueJson: text("value_json", { mode: "json" }).notNull(),
});
```

### Feature 2 — Sign the update feed with Ed25519 and verify before offering updates

The update-service fetches a JSON feed from `PRAXIS_UPDATE_FEED_URL` and uses it
to offer a download link. There is no signature on the feed and no hash on the
linked installer — the finding from
`gate-security-update-feed-integrity-signature`. For v0.1.0 the risk is
documented in `docs/UPDATE-CHANNEL.md` under "Trust model". Full signature
verification becomes mandatory before the project moves to actual auto-update.

**Remediation direction (full implementation).**
1. Generate a maintainer Ed25519 keypair. Private key in a secrets manager;
   public key bundled as a hardcoded constant in the app source.
2. Sign the feed JSON when cutting a release; include the detached Base64
   signature as a `signature` field (or companion `.sig` at a well-known URL).
3. Verify in `update-service.ts` before trusting any feed field using the Web
   Crypto API (`crypto.subtle.verify("Ed25519", publicKey, sig, feedBytes)`).
   Reject and log on failure; do not show an update banner.
4. Add an installer `sha256` field to the feed and verify before surfacing the
   "ready to run" confirmation.
5. Update `docs/UPDATE-CHANNEL.md` with the release-signing step.

**Design considerations.**
- *Key rotation*: document how to rotate (ship a new app version with the new
  key). No online revocation in this model.
- *Build pipeline*: signing runs in release CI, not locally. Feed publish gated
  on successful signature.
- *Backward compatibility*: old clients see an unknown `signature` field; Zod
  ignores unknown fields, so they silently skip verification. Acceptable during
  transition; document it.
- *Failure UX*: on verification failure, the banner stays hidden and the
  main-process log records enough detail to distinguish a misconfiguration from
  an attack.

Evidence:
```typescript
// update-service.ts:42-48 — fetch then JSON-validate; no signature, no pinning
const res = await fetch(url, { headers: { "User-Agent": "Praxis-update-check" } });
if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
raw = await res.json();
```

## Scope notes

The two features are independent at the implementation layer (different files,
different libraries, no shared infrastructure) but share origin (the v0.1.0
security gate) and a single user-facing commitment: "v1 stores secrets safely
and verifies updates before recommending them." Grouping them as an epic lets
release-deploy bind them together when the v0.2 security release is cut, even
though their child stories can land independently.

Origins: `.work/backlog/idea-encrypt-api-key-with-safestorage.md`,
`.work/backlog/idea-update-feed-ed25519-signature.md`.

<!-- Epic-design decomposes this into two child features. -->

## Decomposition

Split by capability, not by layer. The two findings come from the same v0.1.0
security gate but address different attack surfaces (data-at-rest vs. update
supply-chain), touch different files, and use different libraries (Electron
safeStorage vs. Web Crypto Ed25519). No shared types or contracts — they
parallelize cleanly. Grouping them as one epic lets `release-deploy` bind
both into the v0.2 security release with a single user-facing commitment
("v1 stores secrets safely and verifies updates before recommending them"),
while letting each child feature land independently.

### Child features

- `epic-v1-security-hardening-encrypt-api-key` — Wrap the `apiKey` field in
  `engine-config.ts` with Electron's `safeStorage` via a `SecretStorage`
  port + `@praxis/desktop` adapter; one-time migration of plaintext rows on
  startup. Depends on: `[]`
- `epic-v1-security-hardening-sign-update-feed` — Add Ed25519 signature to
  the update feed and verify in `update-service.ts` via Web Crypto before
  surfacing any update banner; bundle the maintainer public key as a
  hardcoded constant. Depends on: `[]`

### Tags propagated

`[security]` propagated to both children. No `[refactor]` or `[perf]` —
both are greenfield capabilities, so the standard feature-design family
runs.

### Decomposition risks

None surfaced during the pre-mortem. The two features are genuinely
independent at every layer; their only commonality is the v0.2 release
bundle. The riskiest sub-element is the API-key migration of existing
plaintext rows (covered in the encrypt-api-key feature's design
considerations as a dedicated story), but it's bounded and well-scoped.

## Children complete (2026-05-12)

Both child features have landed and are at `stage: done`:

- `epic-v1-security-hardening-encrypt-api-key` — **done** (commit `6722806`, reviewed and approved `1bb082c`). SecretStorage port + ElectronSafeStorageAdapter; legacy plaintext rows migrated on first read; refuse-to-save when safeStorage unavailable; inMemorySecretStorage() helper for tests.
- `epic-v1-security-hardening-sign-update-feed` — **done** (commit `f9fe7ac`, reviewed and approved `fa91660`). Detached Ed25519 sig file convention; bundled public key constant (placeholder empty until maintainer generates keypair); installerSha256 surfaced in banner for manual verification; scripts/sign-update-feed.ts for release-time signing; UPDATE-CHANNEL.md trust model rolled forward.

**Cross-cutting**: no shared code between the two features, as the decomposition predicted. Both delivered independently with no integration friction.

**Verification (workspace-wide)**: `pnpm typecheck` green across all 10 packages (incl. root gate); `pnpm test` green (~2810+ tests); `pnpm lint` shows only pre-existing claude-cli-sdk warnings.

**Capability realized**: v1 security commitment delivered end-to-end —
1. API keys at rest are encrypted via the platform keychain (Keychain / DPAPI / libsecret).
2. The update feed is cryptographically signed and verified before any update is surfaced to the user. Tampered feeds produce silent failures with detailed main-process logs.

Advancing epic `implementing → review`. The next autopilot review pass will evaluate the bundle.

## Review (2026-05-12, epic-level)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes (aggregate-only — per-line lenses exercised in each child's review)**:
- Decomposition delivered exactly as designed. The "split by capability" choice played out — zero shared code between encrypt-api-key and sign-update-feed; both landed in any order without friction.
- Foundation-doc alignment: `docs/UPDATE-CHANNEL.md` "Trust model" section rolled forward from deferral to the realized signed-feed contract. `docs/v1-ship-checklist.md` got a tamper-rejection smoke step. No drift in SPEC.md / VISION.md / ARCHITECTURE.md.
- Cross-cutting public-API shifts (all contained to workspace-internal seams): `ServiceDeps.secretStorage` mandatory; `readEngineConfig`/`writeEngineConfig` signature changes; `VisionServiceDeps` gained `secretStorage` to mirror parent. All construction sites updated; the root tsconfig gate (recently enabled) caught every test site at typecheck time.
- Capability check passes end-to-end: API keys encrypted at rest via platform keychain; update feed cryptographically verified before surfacing; both via existing configure / update-banner UX.
- **Open operational item (not a review finding)**: the maintainer must generate the Ed25519 keypair and replace the `UPDATE_FEED_PUBLIC_KEY_BASE64` placeholder before shipping v0.2.x. This is noted in the feature body's JSDoc and in UPDATE-CHANNEL.md. Until then, `checkLatest` returns `status: "disabled"` — safe.

Epic delivered as briefed. Advancing to done.
