import { z } from "zod";
import {
  isVisionCapable,
  requiresVisionModelValidation,
  visionCapableModelsFor,
} from "./vision-models.js";

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

export const EngineConfigSchema = z
  .object({
    engineId: EngineIdSchema,
    /** Model identifier. Optional — adapters apply sensible defaults. */
    model: z.string().optional(),
    /** Provider API key. Read from env first; this is a fallback / explicit value. */
    apiKey: z.string().optional(),
    /** Override the provider base URL (Codex baseUrl, Ollama host, etc.). */
    baseUrl: z.string().url().optional(),
    /** Reasoning effort hint (Claude Code, Codex). */
    effort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
  })
  .superRefine((cfg, ctx) => {
    if (!requiresVisionModelValidation(cfg.engineId)) return;
    if (isVisionCapable(cfg.engineId, cfg.model)) return;

    const examples = visionCapableModelsFor(cfg.engineId).slice(0, 3);
    const examplesStr = examples.length > 0 ? examples.join(", ") : "none listed";
    const modelStr = cfg.model ?? "(none)";

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model"],
      message:
        `Engine "${cfg.engineId}" requires a vision-capable model, but "${modelStr}" is not recognized. ` +
        `Valid examples: ${examplesStr}. ` +
        `Use one of the listed models or a variant that matches the provider's naming pattern.`,
    });
  });

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = { engineId: "claude-code" };
