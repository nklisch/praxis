import { z } from "zod";

export const ENGINE_IDS = [
  "claude-code",
  "codex",
  "direct.anthropic",
  "direct.openai",
  "direct.google",
  "direct.ollama",
] as const;

export const EngineIdSchema = z.enum(ENGINE_IDS);
export type EngineId = z.infer<typeof EngineIdSchema>;

export const EngineConfigSchema = z.object({
  engineId: EngineIdSchema,
  /** Model identifier. Optional — adapters apply sensible defaults. */
  model: z.string().optional(),
  /** Provider API key. Read from env first; this is a fallback / explicit value. */
  apiKey: z.string().optional(),
  /** Override the provider base URL (Codex baseUrl, Ollama host, etc.). */
  baseUrl: z.string().url().optional(),
  /** Reasoning effort hint (Claude Code, Codex). */
  effort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
});

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = { engineId: "claude-code" };
