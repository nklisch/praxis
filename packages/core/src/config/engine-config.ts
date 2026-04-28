import { eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
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
 * Read the resolved engine config: stored value (if any) merged with defaults,
 * then environment overrides applied. Validation throws on malformed stored data.
 *
 * Environment overrides:
 * - PRAXIS_ENGINE → engineId
 * - PRAXIS_MODEL → model
 * - PRAXIS_API_KEY → apiKey  (also: provider-specific keys are read by adapters)
 * - PRAXIS_BASE_URL → baseUrl
 * - PRAXIS_EFFORT → effort
 */
export function readEngineConfig(db: PraxisDb): EngineConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<EngineConfig> | undefined;
  const merged: EngineConfig = EngineConfigSchema.parse({
    ...DEFAULT_ENGINE_CONFIG,
    ...stored,
  });
  return applyEnvOverrides(merged);
}

export function writeEngineConfig(db: PraxisDb, config: EngineConfig): void {
  const validated = EngineConfigSchema.parse(config);
  db.insert(configKv)
    .values({
      key: CONFIG_KEY,
      valueJson: validated,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: validated, updatedAt: new Date() },
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
