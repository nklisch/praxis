---
id: epic-v1-security-hardening-encrypt-api-key
kind: feature
stage: drafting
tags: [security]
parent: epic-v1-security-hardening
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Encrypt API key at rest using Electron safeStorage

## Brief

The Anthropic / OpenAI / Gemini API key currently lives as plaintext JSON in the
SQLite `config_kv` table at row `engine.config`. Any process running under the
same user account — backup tools, synced cloud drives, malware — can read it
directly. The finding from `gate-security-api-key-cleartext-vs-onboarding-doc`
was deferred for v0.1.0 by fixing the documentation claim; this feature delivers
the actual remediation.

The change is bounded: wrap the `apiKey` field in
`packages/core/src/config/engine-config.ts` with Electron's `safeStorage` API
before persisting, and decrypt on read. The platform keychain backs it
(Keychain on macOS, DPAPI on Windows, libsecret on Linux). One transparent
migration is needed for existing databases that already have a plaintext key.

The feature does NOT cover: signing the update feed (that's the sibling
feature), encrypting other config rows beyond the API key, multi-account or
multi-user encryption schemes, or hardware-backed keys.

## Epic context

- Parent epic: `epic-v1-security-hardening`
- Position in epic: **independent capability — no shared types or files with the sign-update-feed sibling**

## Foundation references

- `docs/SPEC.md` — engine configuration / persistence requirements (verify
  during design pass)
- `docs/ARCHITECTURE.md` — the `@praxis/core` ↔ `@praxis/desktop` boundary
  (Electron-specific APIs live in `@praxis/desktop`; the encrypted-blob
  storage in `@praxis/core` needs a port + Electron adapter)
- `docs/UPDATE-CHANNEL.md` (Trust-model section explains the deferral and
  what shipping security work looks like)
- Origin idea: `.work/backlog/idea-encrypt-api-key-with-safestorage.md` (if
  still present)

## Design considerations to address in the design pass

These are flagged by the epic body and should each be resolved with a
concrete decision during `/agile-workflow:feature-design`:

1. **Migration**: existing databases hold plaintext keys. The first startup
   after upgrade must detect plaintext, encrypt, and write back. A schema
   sentinel (e.g., a `valueShape: "encrypted_blob_v1"` field) or a row-side
   marker drives the discrimination. Pick the approach and write the
   one-time migration as a standalone story.
2. **safeStorage availability**: `safeStorage.isEncryptionAvailable()` may
   return false in headless / CI / older Linux desktops without a keyring.
   Decide the fallback policy: warn + refuse to save, warn + accept
   plaintext with `valueShape: "plaintext_fallback"`, or block save until
   the user enables a keyring. The choice affects the configure UX.
3. **Key rotation**: if the OS encryption key rotates (account migration,
   reinstall) the blob becomes unreadable. Document the recovery path
   (re-enter API key in configure surface); the read path should detect
   decryption failure and surface a clear "key unreadable — re-enter"
   message instead of crashing the engine session.
4. **Ports & adapters**: `safeStorage` is an Electron API and must NOT be
   imported from `@praxis/core`. Define a `SecretStorage` port on
   `@praxis/core` whose `encrypt(plaintext): string` /
   `decrypt(blob): string` methods are implemented in `@praxis/desktop`
   (Electron impl) and stubbed in `@praxis/core` tests (in-memory mock).
   The Late-Binding principle applies — engine-config.ts consumes the port,
   not the Electron API.
5. **Testing**: per-package unit tests mock the port; an integration smoke
   test in `@praxis/desktop` exercises the real Electron impl.

<!-- Feature-design pass fills in interfaces, signatures, implementation units, and child stories. -->
