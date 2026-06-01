import type { EngineConfig, EngineId } from "@praxis/core/config";
import type { Engine } from "@praxis/core/types";
import { ClaudeCodeEngine } from "./claude-code/index.js";
import { CodexEngine } from "./codex/index.js";
import { DirectEngine } from "./direct/index.js";
import type { EngineDeps } from "./types.js";

export interface CreateEngineInput {
  config: EngineConfig;
  deps: EngineDeps;
  /**
   * Called immediately after the CLI subprocess is spawned (claude-code only).
   * The desktop layer threads this through to register the PID with an
   * orphan-sweep registry for crash-survival cleanup on next startup.
   */
  onProcessSpawned?: ((pid: number) => void) | undefined;
  /**
   * Called after the CLI subprocess exits (claude-code only). Paired with
   * `onProcessSpawned` — used to deregister the PID on clean close.
   */
  onProcessExited?: ((pid: number) => void) | undefined;
}

/**
 * Build an Engine instance for the given config. Synchronous: returns the
 * adapter; the adapter performs side-effecting setup (subprocess spawn,
 * MCP server start) lazily inside `run()` so construction is cheap and
 * health() can probe without committing resources.
 */
export function createEngine({
  config,
  deps,
  onProcessSpawned,
  onProcessExited,
}: CreateEngineInput): Engine {
  const id: EngineId = config.engineId;
  switch (id) {
    case "claude-code":
      return new ClaudeCodeEngine({ config, deps, onProcessSpawned, onProcessExited });
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
