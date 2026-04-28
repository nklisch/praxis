import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  providerApiKeyEnvName,
  readEngineConfig,
  writeEngineConfig,
} from "../config/engine-config.js";
import { closeDb, openDb } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-test-"));
  dbPath = join(tmpDir, "test.db");
  process.env.PRAXIS_DB_PATH = dbPath;
  runMigrations({ path: dbPath });
});

afterEach(() => {
  closeDb();
  delete process.env.PRAXIS_DB_PATH;
  delete process.env.PRAXIS_ENGINE;
  delete process.env.PRAXIS_MODEL;
  delete process.env.PRAXIS_API_KEY;
  delete process.env.PRAXIS_BASE_URL;
  delete process.env.PRAXIS_EFFORT;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("readEngineConfig", () => {
  it("returns default config on empty DB", () => {
    const { db } = openDb({ path: dbPath });
    const config = readEngineConfig(db);
    expect(config).toEqual({ engineId: "claude-code" });
  });

  it("returns written config after writeEngineConfig", () => {
    const { db } = openDb({ path: dbPath });
    writeEngineConfig(db, { engineId: "direct.anthropic", model: "claude-sonnet-4-5" });
    const config = readEngineConfig(db);
    expect(config.engineId).toBe("direct.anthropic");
    expect(config.model).toBe("claude-sonnet-4-5");
  });

  it("PRAXIS_ENGINE env var overrides stored value", () => {
    const { db } = openDb({ path: dbPath });
    writeEngineConfig(db, { engineId: "direct.anthropic" });
    process.env.PRAXIS_ENGINE = "codex";
    const config = readEngineConfig(db);
    expect(config.engineId).toBe("codex");
  });

  it("PRAXIS_ENGINE with invalid value throws Zod error", () => {
    const { db } = openDb({ path: dbPath });
    process.env.PRAXIS_ENGINE = "garbage";
    expect(() => readEngineConfig(db)).toThrow();
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
