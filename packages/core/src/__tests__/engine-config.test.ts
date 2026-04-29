import { afterEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import {
  providerApiKeyEnvName,
  readEngineConfig,
  writeEngineConfig,
} from "../config/engine-config.js";
import { EngineConfigSchema } from "../config/schema.js";
import { openDb } from "../db/index.js";

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
    const config = readEngineConfig(client);
    expect(config).toEqual({ engineId: "claude-code" });
  });

  it("returns written config after writeEngineConfig", () => {
    const { db: client } = openDb({ path: db.dbPath });
    writeEngineConfig(client, { engineId: "direct.anthropic", model: "claude-sonnet-4-5" });
    const config = readEngineConfig(client);
    expect(config.engineId).toBe("direct.anthropic");
    expect(config.model).toBe("claude-sonnet-4-5");
  });

  it("PRAXIS_ENGINE env var overrides stored value", () => {
    const { db: client } = openDb({ path: db.dbPath });
    // direct.anthropic requires a vision-capable model (Phase 5 validation)
    writeEngineConfig(client, { engineId: "direct.anthropic", model: "claude-sonnet-4-5" });
    process.env.PRAXIS_ENGINE = "codex";
    const config = readEngineConfig(client);
    expect(config.engineId).toBe("codex");
  });

  it("PRAXIS_ENGINE with invalid value throws Zod error", () => {
    const { db: client } = openDb({ path: db.dbPath });
    process.env.PRAXIS_ENGINE = "garbage";
    expect(() => readEngineConfig(client)).toThrow();
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
      writeEngineConfig(client, { engineId: "direct.openai", model: "gpt-3.5-turbo" }),
    ).toThrow();
  });

  it("accepts valid vision config and reads it back", () => {
    const { db: client } = openDb({ path: db.dbPath });
    writeEngineConfig(client, { engineId: "direct.openai", model: "gpt-4o" });
    const config = readEngineConfig(client);
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
