---
id: gate-security-api-key-cleartext-vs-onboarding-doc
kind: story
stage: done
tags: [security]
parent: feature-release-v0.1.0-security-findings
depends_on: []
release_binding: v0.1.0
gate_origin: security
created: 2026-05-10
updated: 2026-05-10
---

# API key stored in plaintext SQLite, contradicting onboarding docs

## Severity
Medium

## Domain
Secrets & Configuration / Documentation drift with security implications

## Location
`packages/core/src/config/engine-config.ts:35-48`,
`packages/core/src/schema.ts:3-7`,
`docs/ONBOARDING.md:66-68`

## Evidence

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

```markdown
// ONBOARDING.md:66-68 — user-facing claim that is not true
enter your API key. The key is stored
encrypted in the local `config_kv` table; it never leaves your
```

Any other process on the same user account, any backup tool, any synced
cloud-drive that catches `~/Library/Application Support/Praxis/praxis.db`,
any malware reading the user's filesystem, gets the API key directly. The
lock service (`packages/core/src/services/lock-service.ts`) hashes the lock
code with scrypt — but the API key, which is the actually valuable secret,
is in cleartext beside it. The onboarding doc explicitly tells users it is
encrypted, which they may rely on when deciding whether the local SQLite is
sensitive or backup-safe.

## Remediation direction

Either:

(a) Change the doc to truthfully say "stored unencrypted in the local
SQLite — protect the file as you would any password file."

(b) Wrap the apiKey field with the platform keychain
(`safeStorage.encryptString()` from Electron — uses Keychain on macOS,
DPAPI on Windows, libsecret on Linux) before persisting and decrypt on
read. `safeStorage` is already available because Electron is the runtime;
the code change is small and bounded to `engine-config.ts`. Doc fix is a
one-line clarification.

Recommend (b); the doc claim sets a user expectation that should be honored.

## Implementation notes

Chose path **(a) — doc fix** for v0.1.0. The documentation claim that the key
is stored "encrypted" was simply false and needed immediate correction
regardless of whether path (b) is ever implemented. The fix replaces the
misleading phrase with a truthful statement that the key is stored unencrypted
and advises users to protect the database file accordingly.

Path (b) — `safeStorage.encryptString()` — is the right long-term answer but
would require a migration strategy for existing plaintext databases, a
fallback for headless/CI environments where `safeStorage.isEncryptionAvailable()`
returns `false`, and a documented recovery path for key rotation scenarios.
These are genuine design questions that deserve their own feature scope and are
too risky to rush into a v0.1.0 release patch. The work is parked in
`.work/backlog/idea-encrypt-api-key-with-safestorage.md`.

## Review (2026-05-10)

**Verdict: Approve**

Correctness: The doc change in `ONBOARDING.md` is accurate. "unencrypted in the local SQLite database (`config_kv` table) — protect that file as you would any password file" is true to the code and gives the user actionable guidance. No "previously" or legacy framing; the sentence reads as current-state.

Design alignment: Path (a) vs (b) is a legitimate triage call. The false claim was an immediate harm to user trust and needed correcting before any encryption work shipped. The safeStorage backlog item is well-formed with design considerations for migration, availability, and key rotation — it is a real follow-up, not a placeholder.

Foundation-doc alignment: ONBOARDING.md now matches the code. No drift introduced. The backlog idea file does not touch foundation docs.
