---
id: epic-v1-security-hardening-encrypt-api-key
kind: feature
stage: review
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

## Design decisions

Ambiguities resolved during this design pass (autopilot delegation, judgment-based):

- **Port location**: `packages/core/src/types/secret-storage.ts` — matches the
  existing pattern (one type file per port domain: `activity.ts`,
  `concept-map-service.ts`, `subagent.ts`, etc.). Keeps the Electron API out
  of `@praxis/core`'s runtime imports.
- **safeStorage unavailability fallback**: **warn + refuse to save** the
  apiKey when `isEncryptionAvailable()` is false. Don't silently downgrade to
  plaintext. Users on headless / no-keyring systems can use `PRAXIS_API_KEY`
  env var (read at runtime via `applyEnvOverrides`, no storage needed). The
  configure UX surfaces the refusal so the user knows the keyring is the
  issue, not the app.
- **Migration trigger**: row-marker on the stored value, not a schema-version
  sentinel. The `EngineConfig` schema gains an optional `apiKeyEncrypted?:
  string` field. Read path prefers `apiKeyEncrypted` (decrypt) over `apiKey`
  (plaintext). When stored row has only plaintext `apiKey`, migrate on read:
  encrypt-and-rewrite, then return the decrypted value. Idempotent — after
  the first migration, only `apiKeyEncrypted` is present.
- **Decryption-failure path**: return `null` for `apiKey` in the resolved
  config, log a `warn`-level message with detail (likely cause: OS keyring
  rotation, account migration, reinstall). Engine adapter's existing
  "missing apiKey" handling (env var fallback or UI prompt) covers the user
  experience. No silent crash, no auto-clearing of the blob.
- **SecretStorage as a ServiceDeps field**: mandatory (`secretStorage:
  SecretStorage`). Tests use a new `inMemorySecretStorage()` helper in
  `tests/helpers/mocks.ts`, joining the family of `noopLogger`,
  `noopLockService`, `noopCourseDocuments`. The "mandatory + test helper"
  shape matches the established pattern from feature-root-tsconfig-typecheck-coverage.
- **engine-config.ts API shape**: thread `secretStorage` as an explicit
  parameter on `readEngineConfig(db, secretStorage)` and `writeEngineConfig(db,
  secretStorage, config)`. The alternative (hoisting into a service with deps
  injection) is larger refactor than this feature warrants. Existing call
  sites live in `ConfigServiceImpl`, which already holds `ServiceDeps` —
  passing `this.deps.secretStorage` through is one extra arg per call.
- **Blob storage format**: base64-encoded Buffer (`safeStorage.encryptString`
  returns `Buffer`; we encode to base64 string for JSON serialization in
  `config_kv.value_json`).
- **Env override behavior**: `PRAXIS_API_KEY` continues to override at read
  time (`applyEnvOverrides` is unchanged). Env keys bypass encryption — that's
  the expected "I know what I'm doing" path for CI/headless contexts.

## Architectural choice

**Port + Electron adapter; encrypt-only path with one-time plaintext migration on first read.**

The port (`SecretStorage`) lives in `@praxis/core/types/`; the Electron
adapter (`ElectronSafeStorageAdapter`) lives in `@praxis/desktop`. The
config module (`engine-config.ts`) takes the port as a parameter and
performs encrypt-on-write / decrypt-on-read transparently. The `EngineConfig`
schema gains an optional `apiKeyEncrypted` field that holds the stored
blob; the in-memory `EngineConfig` continues to carry `apiKey` (the
decrypted value) so downstream code (engine adapters, UI snapshots) needs
no changes.

Rejected alternatives:

- **Hoist engine-config into an EngineConfigService class.** Cleaner DI but
  wider refactor — `readEngineConfig` has multiple call sites that already
  thread `PraxisDb`, and an extra wrapper service adds indirection without
  changing the read/write contract.
- **Store the encrypted blob in a separate `config_kv` row.** Cleaner
  separation of "ciphertext-only" and "metadata" but doubles the row count
  and complicates the migration (now we'd need to detect-and-move between
  rows). The optional `apiKeyEncrypted` field on the same row keeps the
  data co-located.
- **Schema-version sentinel** (`configKvVersion: 2`). Heavyweight for one
  field's migration. The row-marker approach (presence of `apiKeyEncrypted`
  flips the read branch) is cheaper and self-contained.
- **Encrypt all of `config_kv` blanket.** Out of scope — only the `apiKey`
  field has a known threat model. Bootstrap config, onboarding flags, etc.
  don't carry secrets.

## Implementation Units

Tight cohesion across units: port + adapter + read/write path + composition
root + tests all land in one stride. **No child stories spawned** — the
implement-orchestrator runs it as a one-agent wave (mirroring how
feature-docx-ingestor-cleanup was implemented).

### Unit 1: `SecretStorage` port type

**File**: `packages/core/src/types/secret-storage.ts` (new)

```typescript
/**
 * Port for at-rest secret storage. Implementations encrypt and decrypt
 * strings using a platform keychain when available; tests use an
 * in-memory base64 roundtrip.
 *
 * The port abstracts over Electron's `safeStorage` (Keychain on macOS,
 * DPAPI on Windows, libsecret on Linux). `@praxis/core` MUST NOT import
 * the Electron API directly — the adapter lives in `@praxis/desktop`.
 */
export interface SecretStorage {
  /**
   * Returns true when encryption is available on this platform.
   * On Linux without a keyring (libsecret / gnome-keyring / kwallet),
   * this returns false. The config layer refuses to save the apiKey
   * when this is false rather than silently storing plaintext.
   */
  isAvailable(): boolean;

  /**
   * Encrypt a plaintext string. Returns a base64-encoded ciphertext
   * blob suitable for storage in `config_kv.value_json`.
   *
   * Throws `SecretStorageError` with code `unavailable` when
   * `isAvailable()` is false. Callers should check availability first.
   */
  encrypt(plaintext: string): string;

  /**
   * Decrypt a base64-encoded ciphertext blob. Returns null on failure
   * (corrupt blob, keyring rotation, account migration). Callers
   * surface a "re-enter API key" UX rather than throwing.
   */
  decrypt(ciphertextBase64: string): string | null;
}

export class SecretStorageError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "encrypt_failed" | "decrypt_failed",
  ) {
    super(message);
    this.name = "SecretStorageError";
  }
}
```

Also re-export from `packages/core/src/types/index.ts` so consumers can
`import type { SecretStorage } from "@praxis/core/types"`.

**Acceptance Criteria**:
- [ ] `SecretStorage` interface exported from `@praxis/core/types`.
- [ ] `SecretStorageError` class with discriminated `code` field.
- [ ] No Electron imports anywhere in `@praxis/core`.

---

### Unit 2: `ElectronSafeStorageAdapter` (Electron-side implementation)

**File**: `packages/desktop/electron/main/secret-storage.ts` (new)

```typescript
import { safeStorage } from "electron";
import type { SecretStorage } from "@praxis/core/types";
import { SecretStorageError } from "@praxis/core/types";

/**
 * Electron-backed SecretStorage adapter using safeStorage. Lives in the
 * main process; renderer never sees the unencrypted blob.
 *
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: libsecret / kwallet (when available)
 */
export class ElectronSafeStorageAdapter implements SecretStorage {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  encrypt(plaintext: string): string {
    if (!this.isAvailable()) {
      throw new SecretStorageError(
        "safeStorage unavailable on this platform (no OS keyring detected)",
        "unavailable",
      );
    }
    try {
      const buf = safeStorage.encryptString(plaintext);
      return buf.toString("base64");
    } catch (err) {
      throw new SecretStorageError(
        `encrypt failed: ${err instanceof Error ? err.message : String(err)}`,
        "encrypt_failed",
      );
    }
  }

  decrypt(ciphertextBase64: string): string | null {
    if (!this.isAvailable()) return null;
    try {
      const buf = Buffer.from(ciphertextBase64, "base64");
      return safeStorage.decryptString(buf);
    } catch {
      // Decryption failure (corrupt blob, key rotation). Return null so
      // the caller surfaces a re-enter UX instead of crashing.
      return null;
    }
  }
}
```

**Acceptance Criteria**:
- [ ] `ElectronSafeStorageAdapter` implements `SecretStorage`.
- [ ] `decrypt` returns null on `safeStorage.decryptString` throw (does NOT propagate).
- [ ] `encrypt` throws `SecretStorageError` with `code: "unavailable"` when
      safeStorage isn't available.
- [ ] No `@praxis/core/services` imports (this adapter is leaf-level).

---

### Unit 3: Schema extension — `apiKeyEncrypted` field

**File**: `packages/core/src/config/schema.ts`

```typescript
export const EngineConfigSchema = z
  .object({
    engineId: EngineIdSchema,
    model: z.string().optional(),
    /** Provider API key (decrypted form, in-memory). Read paths return this. */
    apiKey: z.string().optional(),
    /**
     * Encrypted apiKey blob (base64-encoded) — what's actually stored in
     * `config_kv` once safeStorage is available. The read path decrypts
     * this and surfaces the result as `apiKey`. Never present alongside a
     * non-empty `apiKey` in the persisted row.
     */
    apiKeyEncrypted: z.string().optional(),
    baseUrl: z.string().url().optional(),
    effort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
  })
  .superRefine(/* existing vision-model check */);
```

**Implementation Notes**:
- The in-memory `EngineConfig` may carry `apiKey` (decrypted), `apiKeyEncrypted`
  (stored blob), or neither. After the read path normalizes, `apiKey` holds
  the decrypted value and `apiKeyEncrypted` is dropped from the returned
  object (or set to undefined) so downstream consumers see one source of
  truth.

**Acceptance Criteria**:
- [ ] Schema accepts rows with `apiKeyEncrypted` set and `apiKey` absent.
- [ ] Schema accepts legacy rows with `apiKey` set and `apiKeyEncrypted` absent.
- [ ] `EngineConfigSchema.parse` doesn't reject when both are present (legacy
      tests may pass both; the read path normalizes).

---

### Unit 4 (trickiest): `engine-config.ts` read/write with migration

**File**: `packages/core/src/config/engine-config.ts`

```typescript
import { eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type { Logger, SecretStorage } from "../types/index.js";
import { configKv } from "../schema.js";
import {
  DEFAULT_ENGINE_CONFIG,
  type EngineConfig,
  EngineConfigSchema,
  type EngineId,
  EngineIdSchema,
} from "./schema.js";

const CONFIG_KEY = "engine";

/**
 * Read the resolved engine config: stored value (if any) decrypted and
 * merged with defaults, then environment overrides applied. Validation
 * throws on malformed stored data.
 *
 * Migration: if the stored row carries plaintext `apiKey` (legacy), the
 * read path encrypts it via `secretStorage`, writes back to
 * `apiKeyEncrypted`, and clears the plaintext `apiKey` field — all in one
 * round-trip on first read after upgrade. Subsequent reads see only the
 * encrypted blob.
 *
 * Decryption failure (corrupt blob, key rotation): logged at warn level;
 * the resolved `apiKey` is null/undefined, and the engine adapter prompts
 * for re-entry.
 */
export function readEngineConfig(
  db: PraxisDb,
  secretStorage: SecretStorage,
  log?: Logger,
): EngineConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<EngineConfig> | undefined;

  let resolvedApiKey: string | undefined;
  let needsMigrationWrite = false;
  let migrationBlob: string | undefined;

  if (stored?.apiKeyEncrypted) {
    // Encrypted path — decrypt for in-memory use.
    const decrypted = secretStorage.decrypt(stored.apiKeyEncrypted);
    if (decrypted === null) {
      log?.warn("engine-config.decrypt_failed", {
        detail: "stored apiKeyEncrypted could not be decrypted (likely keyring rotation)",
      });
      // resolvedApiKey stays undefined; engine adapter handles missing key.
    } else {
      resolvedApiKey = decrypted;
    }
  } else if (stored?.apiKey) {
    // Legacy plaintext path — migrate to encrypted on first read.
    resolvedApiKey = stored.apiKey;
    if (secretStorage.isAvailable()) {
      try {
        migrationBlob = secretStorage.encrypt(stored.apiKey);
        needsMigrationWrite = true;
      } catch (err) {
        log?.warn("engine-config.migration_encrypt_failed", {
          detail: err instanceof Error ? err.message : String(err),
        });
        // Continue with plaintext-in-memory — user retains access, just no
        // at-rest protection yet. Migration will retry on next read.
      }
    }
  }

  // Build the in-memory config from stored fields (minus the persisted
  // encrypted blob) + the resolved apiKey.
  const inMemoryStored: Partial<EngineConfig> = stored
    ? {
        ...stored,
        ...(resolvedApiKey !== undefined && { apiKey: resolvedApiKey }),
      }
    : {};
  // Drop apiKeyEncrypted from the in-memory shape — downstream sees only apiKey.
  delete inMemoryStored.apiKeyEncrypted;

  const merged: EngineConfig = EngineConfigSchema.parse({
    ...DEFAULT_ENGINE_CONFIG,
    ...inMemoryStored,
  });

  // Migration write-back (after a successful decrypt of the legacy plaintext).
  if (needsMigrationWrite && migrationBlob !== undefined && stored) {
    const migrated: Partial<EngineConfig> = {
      ...stored,
      apiKey: undefined,
      apiKeyEncrypted: migrationBlob,
    };
    db.update(configKv)
      .set({ valueJson: migrated, updatedAt: new Date() })
      .where(eq(configKv.key, CONFIG_KEY))
      .run();
  }

  return applyEnvOverrides(merged);
}

export function writeEngineConfig(
  db: PraxisDb,
  secretStorage: SecretStorage,
  config: EngineConfig,
  log?: Logger,
): void {
  const validated = EngineConfigSchema.parse(config);

  // Strip both fields and re-derive — never store both `apiKey` plaintext
  // AND `apiKeyEncrypted`. If safeStorage is unavailable AND the user is
  // setting an apiKey, refuse — surface a clear error.
  const { apiKey, apiKeyEncrypted: _ignored, ...rest } = validated;
  let persisted: EngineConfig;

  if (apiKey === undefined || apiKey === "") {
    // No apiKey to store; both fields absent in persisted row.
    persisted = { ...rest };
  } else if (secretStorage.isAvailable()) {
    try {
      const blob = secretStorage.encrypt(apiKey);
      persisted = { ...rest, apiKeyEncrypted: blob };
    } catch (err) {
      throw new Error(
        `Cannot save apiKey: encryption failed (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  } else {
    // safeStorage unavailable. Refuse to save plaintext.
    log?.warn("engine-config.refuse_plaintext_save", {
      detail: "safeStorage unavailable; apiKey not saved. Use PRAXIS_API_KEY env var instead.",
    });
    throw new Error(
      "Cannot save apiKey: safeStorage is unavailable on this platform. " +
        "Set the PRAXIS_API_KEY environment variable instead, or enable a system keyring.",
    );
  }

  db.insert(configKv)
    .values({ key: CONFIG_KEY, valueJson: persisted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: persisted, updatedAt: new Date() },
    })
    .run();
}

// applyEnvOverrides unchanged.
```

**Implementation Notes**:
- The migration write only fires when we successfully decrypted (or, in the
  legacy plaintext case, successfully encrypted) — never on the
  decrypt-failed path. This keeps user data intact across keyring rotations.
- The `log` parameter is optional so existing test sites (which call
  `readEngineConfig(db)` today) can pass `undefined`; with autopilot's "give
  it the helper" pattern, every wired call site passes `noopLogger()` or the
  real logger.
- The mutation in the migration branch could in theory race with a
  concurrent write, but `config_kv` is single-row-per-key and SQLite
  serializes writes — race window is harmless (worst case: a write
  immediately after migration clobbers the encrypted blob with a fresh
  encrypt of the same plaintext).
- `delete inMemoryStored.apiKeyEncrypted` — TypeScript-safe; the schema's
  optional field accepts undefined.

**Acceptance Criteria**:
- [ ] `readEngineConfig(db, secretStorage)` returns `apiKey` set (decrypted)
      when the stored row has `apiKeyEncrypted`.
- [ ] Reading a legacy plaintext row: surfaces the apiKey in-memory AND
      writes back the encrypted blob to the row (migration).
- [ ] After migration, the stored row has `apiKeyEncrypted` set and `apiKey`
      undefined (not plaintext).
- [ ] Migration is idempotent — second read of the same row does NOT trigger
      another write.
- [ ] Decryption failure: returns config with `apiKey === undefined` and
      logs a warn message; does NOT crash, does NOT clear the stored blob.
- [ ] `writeEngineConfig` with safeStorage available: encrypts the apiKey
      before persisting; stored row has `apiKeyEncrypted` only.
- [ ] `writeEngineConfig` with safeStorage unavailable AND a non-empty
      apiKey: throws a clear error with the env-var hint; nothing is persisted.
- [ ] `writeEngineConfig` with no apiKey (engineId-only change): persists
      successfully regardless of safeStorage availability.
- [ ] `PRAXIS_API_KEY` env override continues to work end-to-end (overrides
      whatever is stored, encrypted or otherwise).

---

### Unit 5: `ServiceDeps.secretStorage` + composition root

**Files**:
- `packages/core/src/services/types.ts` — add `secretStorage: SecretStorage` to `ServiceDeps`
- `packages/core/src/services/config-service.ts` — pass `this.deps.secretStorage` (and `this.deps.log`) to `readEngineConfig` / `writeEngineConfig`
- `packages/desktop/electron/main/services.ts` — instantiate `new ElectronSafeStorageAdapter()`, wire into deps

```typescript
// packages/core/src/services/types.ts
export interface ServiceDeps {
  // ... existing fields ...
  /**
   * At-rest secret storage. Reads decrypt; writes encrypt. The Electron
   * adapter is wired in @praxis/desktop. Tests use inMemorySecretStorage()
   * from tests/helpers/mocks.ts.
   */
  secretStorage: SecretStorage;
}

// packages/core/src/services/config-service.ts
async engineConfig(): Promise<EngineConfigSnapshot> {
  return toSnapshot(readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log));
}
async setEngineConfig(snapshot: EngineConfigSnapshot): Promise<void> {
  const validated = EngineConfigSchema.parse(snapshot);
  writeEngineConfig(this.deps.db, this.deps.secretStorage, validated, this.deps.log);
}
// (other readEngineConfig sites in this file get the same treatment)

// packages/desktop/electron/main/services.ts
import { ElectronSafeStorageAdapter } from "./secret-storage.js";
// ...
const secretStorage = new ElectronSafeStorageAdapter();
// later, in the deps object:
const deps: ServiceDeps = {
  // ... existing ...
  secretStorage,
};
```

**Acceptance Criteria**:
- [ ] `ServiceDeps.secretStorage` is mandatory.
- [ ] Composition root wires `ElectronSafeStorageAdapter`.
- [ ] `ConfigServiceImpl` passes `secretStorage` through to engine-config
      functions on every call.
- [ ] All other call sites of `readEngineConfig` / `writeEngineConfig` in
      the codebase (none expected outside `ConfigServiceImpl` and tests) are
      updated.

---

### Unit 6: In-memory test helper + test coverage

**Files**:
- `tests/helpers/mocks.ts` — add `inMemorySecretStorage()`
- `packages/core/src/__tests__/engine-config.test.ts` — extend with the new contract
- `packages/core/src/services/__tests__/config-service.test.ts` — pass through asserted
- `packages/desktop/electron/main/__tests__/secret-storage.test.ts` (new, if Electron testing is feasible; otherwise skip and rely on the integration smoke test below)

```typescript
// tests/helpers/mocks.ts
export function inMemorySecretStorage(): import("@praxis/core/types").SecretStorage {
  // Base64 roundtrip — not real crypto, but matches the port contract.
  // Tests that exercise migration / decryption-failure use a tampered version
  // that returns null on decrypt.
  return {
    isAvailable: () => true,
    encrypt: (plaintext) => Buffer.from(plaintext, "utf8").toString("base64"),
    decrypt: (b64) => {
      try {
        return Buffer.from(b64, "base64").toString("utf8");
      } catch {
        return null;
      }
    },
  };
}

export function unavailableSecretStorage(): import("@praxis/core/types").SecretStorage {
  return {
    isAvailable: () => false,
    encrypt: () => {
      throw new (require("@praxis/core/types").SecretStorageError)(
        "test: unavailable", "unavailable",
      );
    },
    decrypt: () => null,
  };
}
```

**Test coverage** (extend `engine-config.test.ts`):
- **Fresh write + read round-trip**: write `{ apiKey: "sk-xyz" }`, read,
  assert `cfg.apiKey === "sk-xyz"`; assert stored row has `apiKeyEncrypted`
  and NO `apiKey`.
- **Migration**: seed the row with plaintext `apiKey`; first
  `readEngineConfig` returns the apiKey; assert stored row was updated
  (`apiKeyEncrypted` set, `apiKey` cleared); second read does NOT trigger
  another write.
- **Decryption failure**: stored row has `apiKeyEncrypted: "tampered"`; use
  a SecretStorage variant where decrypt returns null; assert resolved
  `apiKey === undefined` and a warn was logged.
- **Unavailable + write**: `unavailableSecretStorage()` + writeEngineConfig
  with apiKey → throws.
- **Unavailable + write (no apiKey)**: succeeds; only engineId-changing
  writes don't need encryption.
- **Env override**: `PRAXIS_API_KEY` set; readEngineConfig returns env value
  regardless of stored state (existing test extended).

**Desktop integration smoke** (`packages/desktop/electron/main/__tests__/secret-storage.test.ts`):
- This is harder to test without booting Electron's main process. Land a
  minimal smoke test that asserts `ElectronSafeStorageAdapter` is
  constructible and exposes the right methods; the real `safeStorage` calls
  are exercised by manual integration when running `pnpm dev` (note this in
  the test).

**Acceptance Criteria**:
- [ ] `inMemorySecretStorage()` and `unavailableSecretStorage()` helpers
      exist in `tests/helpers/mocks.ts`.
- [ ] All listed test scenarios pass.
- [ ] `pnpm typecheck` green (incl. root gate covering the new test files).
- [ ] No regression in any existing test.

## Implementation Order

1. Unit 1 (port type) + Unit 6's helper — these are the contract; everything
   else builds on them.
2. Unit 3 (schema extension) — enables the migration path to compile.
3. Unit 4 (engine-config.ts read/write) — the migration logic + new encrypt/decrypt
   round-trips. This is the trickiest unit; design it carefully.
4. Unit 5 (ServiceDeps + composition root + ConfigServiceImpl threading).
5. Unit 2 (Electron adapter) — leaf-level; can land last alongside the
   composition-root wiring.
6. Unit 6 test coverage — write tests in parallel with each unit landing.

All six units land in one stride. Single commit OK; multiple thematic
commits also OK if it makes the diff easier to review.

## Testing

See Unit 6 for the per-unit test plan. Cross-cutting verification:

- `pnpm --filter @praxis/core typecheck && pnpm --filter @praxis/core test`
- `pnpm --filter @praxis/desktop typecheck`
- `pnpm typecheck` (the now-enabled root gate covers tests/ that wire `secretStorage`)
- `pnpm test` (workspace-wide regression check)

For the Electron adapter specifically: a full integration test requires
booting Electron's main process (out of scope for this feature's test
budget). The smoke test asserts constructibility; manual verification
during `pnpm dev` confirms the real safeStorage behavior on each
supported platform.

## Risks

1. **`safeStorage.isEncryptionAvailable()` returns false on common Linux
   desktops.** Some headless Linux installs lack libsecret / kwallet / gnome-keyring.
   **Mitigation**: documented PRAXIS_API_KEY env-var workaround; the
   `writeEngineConfig` refusal surfaces a clear actionable error pointing
   to it. The configure UX should ideally reflect "keyring required" as a
   first-class state, but that's a UX polish item — out of scope for the
   security fix.
2. **Migration write-back lands a fresh ciphertext that's harder to recover
   than the plaintext was.** If the user changes machines (and the keyring
   doesn't migrate) before re-entering the apiKey, the encrypted blob
   becomes inert. **Mitigation**: decryption-failure path returns null and
   logs; the configure UX prompts for re-entry. The original threat model
   (plaintext readable by any same-user process) is what this trades against —
   net security improvement is real.
3. **Tests across multiple packages need updating for the mandatory
   `secretStorage` field.** **Mitigation**: same pattern as the recent
   `noopLockService` / `noopCourseDocuments` rollout — `inMemorySecretStorage()`
   helper in mocks.ts. The root tsconfig gate (now active) will catch any
   missed call site at typecheck time.
4. **Both `apiKey` and `apiKeyEncrypted` present in the stored row.**
   Shouldn't happen with the new write path (we strip plaintext before
   persisting), but legacy tests might fixture it. **Mitigation**: read
   path prefers `apiKeyEncrypted`; plaintext is ignored when both are
   present. Document this precedence in the JSDoc.

## Out of scope

- Encrypting other `config_kv` rows (bootstrap config, onboarding flags).
  None carry secrets.
- Hardware-backed keys (TPM, Secure Enclave) beyond what safeStorage
  already chooses for us per platform.
- Multi-account / multi-user encryption (Praxis is single-student per
  install in v1).
- A "first-class keyring required" UX state in the configure surface.
  Surfaced as the error from `writeEngineConfig`, sufficient for v1.
- Auto-clearing stale ciphertext on decrypt failure (caller decides via
  re-entry).

## Implementation notes

All 6 units landed in one stride. Single commit.

### Unit 1: `SecretStorage` port type
Done. `packages/core/src/types/secret-storage.ts` created with `SecretStorage`
interface and `SecretStorageError` class. Both exported from `types/index.ts`.
No Electron imports in `@praxis/core`.

### Unit 2: `ElectronSafeStorageAdapter`
Done. `packages/desktop/electron/main/secret-storage.ts` created. Uses
`safeStorage.encryptString` → base64 string, `safeStorage.decryptString` ←
Buffer from base64. `decrypt` catches all errors and returns null. `encrypt`
throws `SecretStorageError("unavailable")` when `isEncryptionAvailable()` is
false. Desktop smoke test in `electron/main/__tests__/secret-storage.test.ts`
(5 tests, mocked Electron).

**Electron safeStorage API verified**: Electron 41 `safeStorage.encryptString`
returns `Buffer`; `safeStorage.decryptString` takes `Buffer`. The adapter
wraps both correctly. No API shape surprises.

### Unit 3: Schema extension
Done. `apiKeyEncrypted?: z.string().optional()` added to `EngineConfigSchema`
in `packages/core/src/config/schema.ts`. Schema accepts rows with only
`apiKeyEncrypted`, only `apiKey`, or both (read path normalizes).

### Unit 4: `engine-config.ts` read/write
Done. `readEngineConfig(db, secretStorage, log?)` and
`writeEngineConfig(db, secretStorage, config, log?)` implemented with full
migration logic:
- Encrypted path: decrypt → return as `apiKey`
- Legacy plaintext path: return as `apiKey` + migrate on first read (encrypt
  + rewrite row, clear plaintext `apiKey`)
- Decrypt failure: warn, return `apiKey: undefined`
- Write with safeStorage unavailable + apiKey: throw with env-var hint
- Write with no apiKey: succeeds regardless of availability

### Unit 5: `ServiceDeps.secretStorage` + composition root
Done. `ServiceDeps.secretStorage: SecretStorage` added as mandatory field.
`ConfigServiceImpl` passes `this.deps.secretStorage` + `this.deps.log` to
all 4 `readEngineConfig`/`writeEngineConfig` call sites.
`SessionServiceImpl` updated (3 sites). `VisionServiceImpl` updated (1 site,
also gained `secretStorage` in its own `VisionServiceDeps`).
Desktop `buildServices` instantiates `new ElectronSafeStorageAdapter()` after
`LockServiceImpl` and wires it into deps. The 3 bare `readEngineConfig(db)`
calls in engine resolver closures (vision, bootstrap, assignment) also updated.

**ServiceDeps construction sites updated**: 10 total across 10 files:
- `packages/core/src/__tests__/session-service-cancel.test.ts`
- `packages/core/src/__tests__/session-service-list.test.ts`
- `packages/core/src/services/__tests__/session-service.engine-session-state.test.ts`
- `packages/core/src/services/__tests__/session-service.notify.test.ts`
- `packages/core/src/services/__tests__/session-service.prompt-customization.test.ts` (2 sites)
- `tests/configure-end-to-end.test.ts`
- `tests/full-turn-with-fake-engine.test.ts` (6 sites)
- `tests/gates-end-to-end.test.ts`
- `tests/mastery-end-to-end.test.ts`
- `tests/quick-check-tool-context-wiring.test.ts`
- `tests/quiz-end-to-end.test.ts`

### Unit 6: Test helpers + coverage
Done. `inMemorySecretStorage()` and `unavailableSecretStorage()` added to
`tests/helpers/mocks.ts`. All listed test scenarios pass in
`packages/core/src/__tests__/engine-config.test.ts`:
- write + read round-trip
- stored row inspection (apiKeyEncrypted present, apiKey absent)
- migration of legacy plaintext row
- migration idempotency
- decryption failure (null return, warn logged, blob preserved)
- unavailable safeStorage + apiKey → throws
- unavailable safeStorage + no apiKey → succeeds
- PRAXIS_API_KEY env override

### Verification output
```
pnpm typecheck   → all packages pass (no errors)
pnpm test        → 310 test files passed (2 skipped), 2802 tests passed
pnpm lint        → 22 errors (all pre-existing; my files: 0 errors)
```

### No design surprises
Electron 41's `safeStorage` API matches the assumed shape. The `VisionServiceImpl`
had its own `VisionServiceDeps` (not `ServiceDeps`) that also needed
`secretStorage` wired — discovered via typecheck, added cleanly. No escape
hatch was needed.
