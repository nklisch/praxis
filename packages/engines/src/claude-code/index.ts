// TODO(phase-2): implemented by Unit 8 in a follow-up agent.

import type { EngineConfig } from "@praxis/core/config";
import type { Brief, Engine, EngineEvent, HealthStatus, ToolRegistry } from "@praxis/core/types";
import type { EngineDeps } from "../types.js";

export interface ClaudeCodeEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
}

export class ClaudeCodeEngine implements Engine {
  readonly id = "claude-code";
  readonly kind = "looped" as const;

  // biome-ignore lint/complexity/noUselessConstructor: placeholder — Unit 8 will add initialization
  constructor(_opts: ClaudeCodeEngineOptions) {}

  // biome-ignore lint/correctness/useYield: placeholder stub
  async *run(_brief: Brief, _tools: ToolRegistry): AsyncIterable<EngineEvent> {
    throw new Error("not implemented");
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: true, streaming: true, nativeMCP: true, contextWindow: 200000 },
    };
  }
}
