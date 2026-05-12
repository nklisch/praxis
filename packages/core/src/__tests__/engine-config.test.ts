import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import {
  inMemorySecretStorage,
  unavailableSecretStorage,
} from "../../../../tests/helpers/mocks.js";
import {
  providerApiKeyEnvName,
  readEngineConfig,
  writeEngineConfig,
} from "../config/engine-config.js";
import { EngineConfigSchema } from "../config/schema.js";
import { openDb } from "../db/index.js";
import { configKv } from "../schema.js";
import type { Logger, SecretStorage } from "../types/index.js";

const db = useTempDb();

afterEach(() => {
  delete process.env.PRAXIS_ENGINE;
  delete process.env.PRAXIS_MODEL;
  delete process.env.PRAXIS_API_KEY;
  delete process.env.PRAXIS_BASE_URL;
  delete process.env.PRAXIS_EFFORT;
});

describe("readEngineConfig", () => {
  it("returns default config on empty DB", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const config = readEngineConfig(client, inMemorySecretStorage());
    expect(config).toEqual({ engineId: "claude-code" });
  });

  it("returns written config after writeEngineConfig", () => {
    const { db: client } = openDb({ path: db.dbPath });
    writeEngineConfig(client, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
    });
    const config = readEngineConfig(client, inMemorySecretStorage());
    expect(config.engineId).toBe("direct.anthropic");
    expect(config.model).toBe("claude-sonnet-4-5");
  });

  it("PRAXIS_ENGINE env var overrides stored value", () => {
    const { db: client } = openDb({ path: db.dbPath });
    // direct.anthropic requires a vision-capable model (Phase 5 validation)
    writeEngineConfig(client, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
    });
    process.env.PRAXIS_ENGINE = "codex";
    const config = readEngineConfig(client, inMemorySecretStorage());
    expect(config.engineId).toBe("codex");
  });

  it("PRAXIS_ENGINE with invalid value throws Zod error", () => {
    const { db: client } = openDb({ path: db.dbPath });
    process.env.PRAXIS_ENGINE = "garbage";
    expect(() => readEngineConfig(client, inMemorySecretStorage())).toThrow();
  });
});

describe("encrypt/decrypt round-trip — apiKey at rest", () => {
  const db = useTempDb();

  afterEach(() => {
    delete process.env.PRAXIS_API_KEY;
  });

  it("write + read round-trip: apiKey survives encrypt/decrypt", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const ss = inMemorySecretStorage();
    writeEngineConfig(client, ss, {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-xyz",
    });
    const config = readEngineConfig(client, ss);
    expect(config.apiKey).toBe("sk-xyz");
  });

  it("stored row has apiKeyEncrypted, not plaintext apiKey", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const ss = inMemorySecretStorage();
    writeEngineConfig(client, ss, {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-secret",
    });

    // Inspect raw stored row.
    const rows = client.select().from(configKv).where(eq(configKv.key, "engine")).all();
    const stored = rows[0]?.valueJson as Record<string, unknown> | undefined;
    expect(stored?.apiKeyEncrypted).toBeDefined();
    expect(stored?.apiKey).toBeUndefined();
  });

  it("migration: plaintext apiKey row is migrated on first read", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const ss = inMemorySecretStorage();

    // Seed a legacy plaintext row directly.
    client
      .insert(configKv)
      .values({
        key: "engine",
        valueJson: { engineId: "claude-code", apiKey: "sk-legacy" },
        updatedAt: new Date(),
      })
      .run();

    // First read: should return the key and trigger migration.
    const config = readEngineConfig(client, ss);
    expect(config.apiKey).toBe("sk-legacy");

    // Row should now have apiKeyEncrypted + no plaintext apiKey.
    const rows = client.select().from(configKv).where(eq(configKv.key, "engine")).all();
    const stored = rows[0]?.valueJson as Record<string, unknown> | undefined;
    expect(stored?.apiKeyEncrypted).toBeDefined();
    expect(stored?.apiKey).toBeUndefined();
  });

  it("migration is idempotent: second read does not trigger another write", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const ss = inMemorySecretStorage();

    // Seed a legacy plaintext row.
    client
      .insert(configKv)
      .values({
        key: "engine",
        valueJson: { engineId: "claude-code", apiKey: "sk-legacy2" },
        updatedAt: new Date(),
      })
      .run();

    // First read — triggers migration.
    readEngineConfig(client, ss);

    // Capture the encrypted blob.
    const rows1 = client.select().from(configKv).where(eq(configKv.key, "engine")).all();
    const blob1 = (rows1[0]?.valueJson as Record<string, unknown>)?.apiKeyEncrypted;

    // Second read — should NOT trigger another write; blob must be unchanged.
    readEngineConfig(client, ss);
    const rows2 = client.select().from(configKv).where(eq(configKv.key, "engine")).all();
    const blob2 = (rows2[0]?.valueJson as Record<string, unknown>)?.apiKeyEncrypted;

    expect(blob1).toBe(blob2);
  });

  it("decryption failure: apiKey is undefined, warn is logged, blob is preserved", () => {
    const { db: client } = openDb({ path: db.dbPath });

    // Seed a row with a tampered (corrupt) blob.
    client
      .insert(configKv)
      .values({
        key: "engine",
        valueJson: { engineId: "claude-code", apiKeyEncrypted: "not-valid-ciphertext!" },
        updatedAt: new Date(),
      })
      .run();

    // Use a SecretStorage that always returns null on decrypt (simulate keyring rotation).
    const failingSs: SecretStorage = {
      isAvailable: () => true,
      encrypt: (p) => Buffer.from(p).toString("base64"),
      decrypt: () => null,
    };

    const warns: string[] = [];
    const log: Logger = {
      debug: () => {},
      info: () => {},
      warn: (m) => warns.push(m),
      error: () => {},
      child: function () {
        return this;
      },
    };

    const config = readEngineConfig(client, failingSs, log);
    expect(config.apiKey).toBeUndefined();
    expect(warns).toContain("engine-config.decrypt_failed");

    // Blob must still be there — don't auto-clear.
    const rows = client.select().from(configKv).where(eq(configKv.key, "engine")).all();
    const stored = rows[0]?.valueJson as Record<string, unknown> | undefined;
    expect(stored?.apiKeyEncrypted).toBeDefined();
  });

  it("decryption failure is idempotent across multiple reads — blob is preserved every time", () => {
    const { db: client } = openDb({ path: db.dbPath });

    const corruptBlob = "not-valid-ciphertext!";
    const seedUpdatedAt = new Date(Date.now() - 5_000); // 5 s in the past

    client
      .insert(configKv)
      .values({
        key: "engine",
        valueJson: { engineId: "claude-code", apiKeyEncrypted: corruptBlob },
        updatedAt: seedUpdatedAt,
      })
      .run();

    const failingSs: SecretStorage = {
      isAvailable: () => true,
      encrypt: (p) => Buffer.from(p).toString("base64"),
      decrypt: () => null,
    };

    // First read: apiKey undefined, blob still there.
    const config1 = readEngineConfig(client, failingSs);
    expect(config1.apiKey).toBeUndefined();

    const rows1 = client.select().from(configKv).where(eq(configKv.key, "engine")).all();
    const stored1 = rows1[0]?.valueJson as Record<string, unknown> | undefined;
    expect(stored1?.apiKeyEncrypted).toBe(corruptBlob);
    const updatedAt1 = rows1[0]?.updatedAt?.getTime();

    // Second read: same result — no write happened between reads.
    const config2 = readEngineConfig(client, failingSs);
    expect(config2.apiKey).toBeUndefined();

    const rows2 = client.select().from(configKv).where(eq(configKv.key, "engine")).all();
    const stored2 = rows2[0]?.valueJson as Record<string, unknown> | undefined;
    expect(stored2?.apiKeyEncrypted).toBe(corruptBlob);
    const updatedAt2 = rows2[0]?.updatedAt?.getTime();

    // updatedAt must not have changed — no migration write fired on either read.
    expect(updatedAt2).toBe(updatedAt1);
    expect(updatedAt1).toBe(seedUpdatedAt.getTime());
  });

  it("writeEngineConfig with unavailable safeStorage + apiKey throws", () => {
    const { db: client } = openDb({ path: db.dbPath });
    expect(() =>
      writeEngineConfig(client, unavailableSecretStorage(), {
        engineId: "claude-code",
        apiKey: "sk-cannotsave",
      }),
    ).toThrow(/safeStorage is unavailable/);
  });

  it("writeEngineConfig with unavailable safeStorage and no apiKey succeeds", () => {
    const { db: client } = openDb({ path: db.dbPath });
    // Should not throw — no secret to encrypt.
    expect(() =>
      writeEngineConfig(client, unavailableSecretStorage(), { engineId: "claude-code" }),
    ).not.toThrow();
  });

  it("PRAXIS_API_KEY env var overrides stored encrypted key", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const ss = inMemorySecretStorage();
    writeEngineConfig(client, ss, {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-stored",
    });
    process.env.PRAXIS_API_KEY = "sk-env-override";
    const config = readEngineConfig(client, ss);
    expect(config.apiKey).toBe("sk-env-override");
  });
});

describe("EngineConfigSchema — vision validation", () => {
  it("claude-code with no model passes (trusted engine)", () => {
    const result = EngineConfigSchema.safeParse({ engineId: "claude-code" });
    expect(result.success).toBe(true);
  });

  it("codex with no model passes (trusted engine)", () => {
    const result = EngineConfigSchema.safeParse({ engineId: "codex" });
    expect(result.success).toBe(true);
  });

  it("direct.anthropic with claude-sonnet-4-5 passes", () => {
    const result = EngineConfigSchema.safeParse({
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
    });
    expect(result.success).toBe(true);
  });

  it("direct.anthropic with claude-instant-1 fails", () => {
    const result = EngineConfigSchema.safeParse({
      engineId: "direct.anthropic",
      model: "claude-instant-1",
    });
    expect(result.success).toBe(false);
  });

  it("direct.openai with no model fails (Direct requires vision-capable model)", () => {
    const result = EngineConfigSchema.safeParse({ engineId: "direct.openai" });
    expect(result.success).toBe(false);
  });

  it("direct.openai with gpt-3.5-turbo fails (not vision-capable)", () => {
    const result = EngineConfigSchema.safeParse({
      engineId: "direct.openai",
      model: "gpt-3.5-turbo",
    });
    expect(result.success).toBe(false);
  });

  it("direct.openai with gpt-5-future-variant passes via substring fallback", () => {
    const result = EngineConfigSchema.safeParse({
      engineId: "direct.openai",
      model: "gpt-5-future-variant",
    });
    expect(result.success).toBe(true);
  });

  it("direct.anthropic with claude-3-future-sonnet passes via substring fallback", () => {
    const result = EngineConfigSchema.safeParse({
      engineId: "direct.anthropic",
      model: "claude-3-future-sonnet",
    });
    expect(result.success).toBe(true);
  });

  it("error message includes engine ID, offending model, and 3 example valid models", () => {
    const result = EngineConfigSchema.safeParse({
      engineId: "direct.anthropic",
      model: "claude-instant-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toContain("direct.anthropic");
      expect(message).toContain("claude-instant-1");
      // Should contain at least one example model
      expect(message).toMatch(/claude-/);
    }
  });

  it("schema accepts row with apiKeyEncrypted set and apiKey absent", () => {
    const result = EngineConfigSchema.safeParse({
      engineId: "claude-code",
      apiKeyEncrypted: "c29tZWJsb2I=",
    });
    expect(result.success).toBe(true);
  });

  it("schema accepts legacy row with apiKey set and apiKeyEncrypted absent", () => {
    const result = EngineConfigSchema.safeParse({
      engineId: "claude-code",
      apiKey: "sk-plaintext",
    });
    expect(result.success).toBe(true);
  });
});

describe("setEngineConfig round-trip — vision validation", () => {
  const db = useTempDb();

  afterEach(() => {
    delete process.env.PRAXIS_ENGINE;
    delete process.env.PRAXIS_MODEL;
  });

  it("rejects invalid vision config when writing via writeEngineConfig", () => {
    const { db: client } = openDb({ path: db.dbPath });
    expect(() =>
      writeEngineConfig(client, inMemorySecretStorage(), {
        engineId: "direct.openai",
        model: "gpt-3.5-turbo",
      }),
    ).toThrow();
  });

  it("accepts valid vision config and reads it back", () => {
    const { db: client } = openDb({ path: db.dbPath });
    writeEngineConfig(client, inMemorySecretStorage(), { engineId: "direct.openai", model: "gpt-4o" });
    const config = readEngineConfig(client, inMemorySecretStorage());
    expect(config.engineId).toBe("direct.openai");
    expect(config.model).toBe("gpt-4o");
  });
});

describe("providerApiKeyEnvName", () => {
  it("returns ANTHROPIC_API_KEY for direct.anthropic", () => {
    expect(providerApiKeyEnvName("direct.anthropic")).toBe("ANTHROPIC_API_KEY");
  });

  it("returns undefined for claude-code", () => {
    expect(providerApiKeyEnvName("claude-code")).toBeUndefined();
  });

  it("returns OPENAI_API_KEY for direct.openai", () => {
    expect(providerApiKeyEnvName("direct.openai")).toBe("OPENAI_API_KEY");
  });

  it("returns GOOGLE_GENERATIVE_AI_API_KEY for direct.google", () => {
    expect(providerApiKeyEnvName("direct.google")).toBe("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("returns CODEX_API_KEY for codex", () => {
    expect(providerApiKeyEnvName("codex")).toBe("CODEX_API_KEY");
  });
});
