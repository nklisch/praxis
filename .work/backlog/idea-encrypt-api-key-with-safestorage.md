---
kind: feature
tags: [security]
created: 2026-05-10
---

# Encrypt API key at rest using Electron safeStorage

## Summary

The Anthropic / OpenAI / Gemini API key is currently stored as plaintext JSON in
the SQLite `config_kv` table. Any process on the same user account — backup
tools, synced cloud drives, or malware — can read it directly. This is the
finding from `gate-security-api-key-cleartext-vs-onboarding-doc` (v0.1.0
security gate), which was resolved for v0.1.0 by fixing the misleading
documentation claim rather than adding encryption.

## Remediation direction (path b from the security story)

Wrap the `apiKey` field in `packages/core/src/config/engine-config.ts`
with Electron's `safeStorage` API before persisting and decrypt on read:

- `safeStorage.encryptString(apiKey)` → store as base64 blob in `config_kv`
- `safeStorage.decryptString(blob)` → decode on read

`safeStorage` uses the platform keychain (Keychain on macOS, DPAPI on
Windows, libsecret on Linux) and is available in Electron without additional
dependencies. The code change is bounded to `engine-config.ts`.

## Evidence (from security review)

```typescript
// engine-config.ts:36-47 — raw config object (apiKey field) JSON-stringified into config_kv.value_json
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

## Design considerations before implementing

- **Migration**: existing databases have plaintext keys. A one-time migration
  must detect and re-encrypt them on first startup. The schema version or a
  sentinel value can mark whether the key is already encrypted.
- **safeStorage availability**: `safeStorage.isEncryptionAvailable()` may
  return `false` in some CI or headless environments. Need a fallback
  strategy (warn user, refuse to save, or accept plaintext with a logged
  warning).
- **Key rotation**: if the encryption key changes (e.g., OS reinstall, user
  account migration), the stored blob becomes unreadable. Doc the recovery
  path (re-enter API key in configure surface).
- **Testing**: safeStorage is an Electron API — unit tests must mock it; add
  an integration smoke test in the desktop package.
