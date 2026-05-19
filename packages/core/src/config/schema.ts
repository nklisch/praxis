import { z } from "zod";
import { isAllowedExternalUrl } from "../types/url-allowlist.js";
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

const visionModelRefine = (
  cfg: { engineId: EngineId; model?: string | undefined },
  ctx: z.RefinementCtx,
) => {
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
};

/**
 * Public-API engine config — what the renderer / client hands over via
 * `setEngineConfig`. Strict: any unknown key (including `apiKeyEncrypted`)
 * is rejected, so the renderer cannot inject ciphertext. The decrypted
 * `apiKey` field is in-memory-only.
 */
export const EngineConfigSchema = z
  .object({
    engineId: EngineIdSchema,
    /** Model identifier. Optional — adapters apply sensible defaults. */
    model: z.string().optional(),
    /** Provider API key (decrypted form, in-memory only). Read paths return this. */
    apiKey: z.string().optional(),
    /** Override the provider base URL (Codex baseUrl, Ollama host, etc.). */
    baseUrl: z
      .string()
      .optional()
      .refine((v) => v === undefined || isAllowedExternalUrl(v), {
        message: "baseUrl must be a plain http(s) URL",
      }),
    /** Reasoning effort hint (Claude Code, Codex). */
    effort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
  })
  .strict()
  .superRefine(visionModelRefine);

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

/**
 * Persistence-layer schema — same fields plus `apiKeyEncrypted`. Used only
 * by `readEngineConfig` / `writeEngineConfig` to validate stored rows.
 * Renderer code never sees this schema — `setEngineConfig` validates via
 * `EngineConfigSchema` (strict, no ciphertext field) so callers can't
 * inject a forged blob. Like the public schema this is `.strict()` so
 * unknown top-level keys are rejected rather than silently stripped —
 * pins the persistence-boundary contract.
 */
export const EngineConfigStoredSchema = z
  .object({
    engineId: EngineIdSchema,
    model: z.string().optional(),
    apiKey: z.string().optional(),
    apiKeyEncrypted: z.string().optional(),
    baseUrl: z.string().url().optional(),
    effort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
  })
  .strict()
  .superRefine(visionModelRefine);

export type EngineConfigStored = z.infer<typeof EngineConfigStoredSchema>;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = { engineId: "claude-code" };
