import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { EngineConfig } from "@praxis/core/config";
import type { LanguageModel } from "ai";
import { createOllama } from "ollama-ai-provider-v2";

export type DirectProvider = "anthropic" | "openai" | "google" | "ollama";

const DEFAULT_MODELS: Record<DirectProvider, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
  // Gemini 3.5 Flash went GA at I/O 2026 (2026-05-19) and outperforms
  // gemini-3.1-pro on Terminal-Bench 2.1, GDPval-AA, and MCP Atlas while
  // running ~4x faster. Pro tier for Gemini 3.5 ships next month — until
  // then `gemini-3.1-pro-preview` (GA despite the "preview" in the id) is
  // the recommended Pro override via EngineConfig.model.
  google: "gemini-3.5-flash",
  ollama: "llama3.2",
};

/**
 * Resolve the LanguageModel for a Direct provider. API keys are NOT passed
 * via SDK constructor — each provider's SDK reads its own env var (or the
 * default for the provider). The Praxis script is responsible for setting
 * the env before invoking createEngine. For Ollama, baseUrl picks the host.
 */
export function resolveModel(provider: DirectProvider, config: EngineConfig): LanguageModel {
  const modelId = config.model ?? DEFAULT_MODELS[provider];
  switch (provider) {
    case "anthropic":
      return anthropic(modelId);
    case "openai":
      return openai(modelId);
    case "google":
      return google(modelId);
    case "ollama": {
      const opts = config.baseUrl ? { baseURL: config.baseUrl } : {};
      const ollamaProvider = createOllama(opts);
      return ollamaProvider(modelId);
    }
  }
}
