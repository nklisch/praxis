import { eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import { configKv } from "../schema.js";
import type { Logger, SecretStorage } from "../types/index.js";
import {
  DEFAULT_ENGINE_CONFIG,
  type EngineConfig,
  EngineConfigSchema,
  type EngineConfigStored,
  EngineConfigStoredSchema,
  type EngineId,
  EngineIdSchema,
} from "./schema.js";

const CONFIG_KEY = "engine";

/**
 * Read the resolved engine config: stored value (if any) decrypted and
 * merged with defaults, then environment overrides applied. Validation
 * throws on malformed stored data.
 *
 * Environment overrides:
 * - PRAXIS_ENGINE → engineId
 * - PRAXIS_MODEL → model
 * - PRAXIS_API_KEY → apiKey  (also: provider-specific keys are read by adapters)
 * - PRAXIS_BASE_URL → baseUrl
 * - PRAXIS_EFFORT → effort
 *
 * Migration: if the stored row carries plaintext `apiKey` (legacy), the
 * read path encrypts it via `secretStorage`, writes back to
 * `apiKeyEncrypted`, and clears the plaintext `apiKey` field — all in one
 * round-trip on first read after upgrade. Subsequent reads see only the
 * encrypted blob.
 *
 * Decryption failure (corrupt blob, key rotation): logged at warn level;
 * the resolved `apiKey` is undefined, and the engine adapter prompts
 * for re-entry via env var or the configure surface.
 *
 * When both `apiKeyEncrypted` and plaintext `apiKey` are present (shouldn't
 * happen with normal write path, but guarded anyway), the encrypted blob
 * takes precedence.
 */
export function readEngineConfig(
  db: PraxisDb,
  secretStorage: SecretStorage,
  log?: Logger,
): EngineConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<EngineConfigStored> | undefined;

  let resolvedApiKey: string | undefined;
  let needsMigrationWrite = false;
  let migrationBlob: string | undefined;

  if (stored?.apiKeyEncrypted) {
    // Encrypted path — decrypt for in-memory use.
    const decrypted = secretStorage.decrypt(stored.apiKeyEncrypted);
    if (decrypted === null) {
      log?.warn("engine-config.decrypt_failed", {
        detail:
          "stored apiKeyEncrypted could not be decrypted (likely keyring rotation or account migration)",
      });
      // resolvedApiKey stays undefined; engine adapter handles missing key via
      // env var fallback or configure surface prompt.
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

  // Build the in-memory public config from stored fields (minus the
  // persisted encrypted blob) + the resolved apiKey. Downstream code always
  // sees `apiKey` (decrypted) and never `apiKeyEncrypted`.
  const inMemoryStored: Partial<EngineConfig> = {};
  if (stored) {
    if (stored.engineId !== undefined) inMemoryStored.engineId = stored.engineId;
    if (stored.model !== undefined) inMemoryStored.model = stored.model;
    if (stored.baseUrl !== undefined) inMemoryStored.baseUrl = stored.baseUrl;
    if (stored.effort !== undefined) inMemoryStored.effort = stored.effort;
    if (resolvedApiKey !== undefined) inMemoryStored.apiKey = resolvedApiKey;
  }

  const merged: EngineConfig = EngineConfigSchema.parse({
    ...DEFAULT_ENGINE_CONFIG,
    ...inMemoryStored,
  });

  // Migration write-back: encrypt the legacy plaintext row and rewrite.
  // Only fires after a successful encryption of the legacy plaintext key.
  if (needsMigrationWrite && migrationBlob !== undefined && stored) {
    const migrated: Partial<EngineConfigStored> = {
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

/**
 * Persist an engine config. If `config.apiKey` is set and safeStorage is
 * available, the key is encrypted before storage. If safeStorage is
 * unavailable and the config has a non-empty apiKey, this throws a clear
 * error pointing to the `PRAXIS_API_KEY` env var workaround.
 *
 * The `apiKeyEncrypted` field (if present on the in-memory config) is
 * always stripped before persisting — the write path re-derives the blob
 * from the plaintext apiKey.
 */
export function writeEngineConfig(
  db: PraxisDb,
  secretStorage: SecretStorage,
  config: EngineConfig,
  log?: Logger,
): void {
  const validated = EngineConfigSchema.parse(config);

  const { apiKey, ...rest } = validated;
  let persisted: Partial<EngineConfigStored>;

  if (apiKey === undefined || apiKey === "") {
    // No apiKey to store; omit both key fields from persisted row.
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
    // safeStorage unavailable — refuse to persist plaintext.
    log?.warn("engine-config.refuse_plaintext_save", {
      detail: "safeStorage unavailable; apiKey not saved. Use PRAXIS_API_KEY env var instead.",
    });
    throw new Error(
      "Cannot save apiKey: safeStorage is unavailable on this platform. " +
        "Set the PRAXIS_API_KEY environment variable instead, or enable a system keyring.",
    );
  }

  // Final validation against the stored schema before persisting.
  const finalRow = EngineConfigStoredSchema.parse(persisted);

  db.insert(configKv)
    .values({ key: CONFIG_KEY, valueJson: finalRow, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: finalRow, updatedAt: new Date() },
    })
    .run();
}

function applyEnvOverrides(base: EngineConfig): EngineConfig {
  const env = process.env;
  const candidate: EngineConfig = { ...base };
  if (env.PRAXIS_ENGINE) candidate.engineId = EngineIdSchema.parse(env.PRAXIS_ENGINE);
  if (env.PRAXIS_MODEL) candidate.model = env.PRAXIS_MODEL;
  if (env.PRAXIS_API_KEY) candidate.apiKey = env.PRAXIS_API_KEY;
  if (env.PRAXIS_BASE_URL) candidate.baseUrl = env.PRAXIS_BASE_URL;
  if (env.PRAXIS_EFFORT) {
    candidate.effort = EngineConfigSchema.shape.effort.unwrap().parse(env.PRAXIS_EFFORT);
  }
  return candidate;
}

/** Provider-specific env key for a given engine. */
export function providerApiKeyEnvName(engineId: EngineId): string | undefined {
  switch (engineId) {
    case "direct.anthropic":
      return "ANTHROPIC_API_KEY";
    case "direct.openai":
      return "OPENAI_API_KEY";
    case "direct.google":
      return "GOOGLE_GENERATIVE_AI_API_KEY";
    case "codex":
      return "CODEX_API_KEY";
    case "claude-code":
    case "direct.ollama":
      return undefined;
  }
}
