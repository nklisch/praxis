import type { EngineConfig, EngineId } from "@praxis/core/config";
import type { Engine } from "@praxis/core/types";
import { ClaudeCodeEngine } from "./claude-code/index.js";
import { CodexEngine } from "./codex/index.js";
import { DirectEngine } from "./direct/index.js";
import type { EngineDeps } from "./types.js";

export interface CreateEngineInput {
  config: EngineConfig;
  deps: EngineDeps;
}

/**
 * Build an Engine instance for the given config. Synchronous: returns the
 * adapter; the adapter performs side-effecting setup (subprocess spawn,
 * MCP server start) lazily inside `run()` so construction is cheap and
 * health() can probe without committing resources.
 */
export function createEngine({ config, deps }: CreateEngineInput): Engine {
  const id: EngineId = config.engineId;
  switch (id) {
    case "claude-code":
      return new ClaudeCodeEngine({ config, deps });
    case "codex":
      return new CodexEngine({ config, deps });
    case "direct.anthropic":
      return new DirectEngine({ config, deps, provider: "anthropic" });
    case "direct.openai":
      return new DirectEngine({ config, deps, provider: "openai" });
    case "direct.google":
      return new DirectEngine({ config, deps, provider: "google" });
    case "direct.ollama":
      return new DirectEngine({ config, deps, provider: "ollama" });
  }
}
