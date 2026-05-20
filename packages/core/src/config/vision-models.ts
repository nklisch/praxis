/**
 * Per-provider vision-capable model allow-lists.
 *
 * Design notes:
 * - `claude-code` and `codex` are TRUSTED: their CLI defaults are vision-capable
 *   and they don't accept an explicit model selector in the same way.
 * - Direct providers must select from this list (or pass a substring-matched
 *   future variant — forward-compat for unreleased model names).
 * - Substring fallback uses a per-provider regex; see `isVisionCapable`.
 */

/** Known vision-capable models per Direct provider. Single source of truth. */
export const VISION_MODELS: Record<string, ReadonlyArray<string>> = {
  "direct.anthropic": [
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
    "claude-opus-4-0",
    "claude-sonnet-4-0",
    "claude-haiku-4-0",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
  ],
  "direct.openai": [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4-vision-preview",
    "gpt-5",
    "o1",
    "o3",
    "o3-mini",
    "o4-mini",
  ],
  "direct.google": [
    // 3.5 family — gemini-3.5-flash went GA at I/O 2026 (2026-05-19);
    // gemini-3.5-pro ships next month and is listed here for forward-compat
    // so users can opt in via EngineConfig.model the day it lands.
    "gemini-3.5-flash",
    "gemini-3.5-pro",
    // 3.1 Pro — GA despite the "preview" suffix in the official id
    // (see https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview).
    "gemini-3.1-pro-preview",
    // Older generations retained for backward compat with persisted configs.
    // gemini-3-pro-preview was discontinued 2026-03-26 — intentionally omitted.
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-pro",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-ultra",
  ],
  "direct.ollama": [
    "llama3.2-vision",
    "llama3.2-vision:11b",
    "llama3.2-vision:90b",
    "llava",
    "llava:13b",
    "llava:34b",
    "llava-llama3",
    "moondream",
    "minicpm-v",
  ],
} as const;

/** Default vision-capable model for each Direct provider. */
export const DEFAULT_VISION_MODEL: Record<string, string> = {
  "direct.anthropic": "claude-sonnet-4-5",
  "direct.openai": "gpt-4o",
  "direct.google": "gemini-3.5-flash",
  "direct.ollama": "llava",
} as const;

/**
 * Substring-match regexes for forward-compat — matches unreleased model
 * variants that contain a vision-capable model family name.
 */
const VISION_SUBSTR_PATTERNS: Record<string, RegExp> = {
  // Matches any claude-* model containing a vision-capable family name.
  // Handles patterns like: claude-sonnet-4-5, claude-3-5-sonnet-..., claude-3-future-sonnet.
  "direct.anthropic": /claude-.*?(sonnet|opus|haiku)/i,
  "direct.openai": /gpt-4[o-]|gpt-5|o\d+/i,
  "direct.google": /gemini-\d+\.\d+-(pro|flash|ultra)/i,
  "direct.ollama": /llava|moondream|minicpm|vision/i,
};

/**
 * Whether this engine ID requires model validation.
 * `claude-code` and `codex` are trusted — their CLI defaults are vision-capable.
 */
export function requiresVisionModelValidation(engineId: string): boolean {
  return engineId !== "claude-code" && engineId !== "codex";
}

/**
 * Check whether a model is vision-capable for the given engine.
 *
 * Checks the explicit allow-list first, then falls back to substring
 * pattern matching for forward-compat with unreleased variants.
 * Returns `true` for trusted engines (claude-code, codex).
 */
export function isVisionCapable(engineId: string, model: string | undefined): boolean {
  if (!requiresVisionModelValidation(engineId)) return true;
  if (!model) return false;

  const allowList = VISION_MODELS[engineId];
  if (!allowList) return false;

  if (allowList.includes(model)) return true;

  const pattern = VISION_SUBSTR_PATTERNS[engineId];
  return pattern ? pattern.test(model) : false;
}

/**
 * Return the vision-capable models for an engine. Used in error messages and
 * future Settings UI.
 */
export function visionCapableModelsFor(engineId: string): ReadonlyArray<string> {
  return VISION_MODELS[engineId] ?? [];
}
