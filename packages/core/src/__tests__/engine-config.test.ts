import { afterEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import {
  providerApiKeyEnvName,
  readEngineConfig,
  writeEngineConfig,
} from "../config/engine-config.js";
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
    writeEngineConfig(client, { engineId: "direct.anthropic" });
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
