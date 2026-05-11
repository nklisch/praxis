---
id: epic-v1-security-hardening
kind: epic
stage: drafting
tags: [security]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
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
