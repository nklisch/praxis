// TODO(phase-2): implemented by Unit 10 in a follow-up agent.

import type { EngineConfig } from "@praxis/core/config";
import type { Brief, Engine, EngineEvent, HealthStatus, ToolRegistry } from "@praxis/core/types";
import type { EngineDeps } from "../types.js";

export type DirectProvider = "anthropic" | "openai" | "google" | "ollama";

export interface DirectEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
  provider: DirectProvider;
}

export class DirectEngine implements Engine {
  readonly id: string;
  readonly kind = "single-shot" as const;

  constructor(opts: DirectEngineOptions) {
    this.id = `direct.${opts.provider}`;
  }

  // biome-ignore lint/correctness/useYield: placeholder stub
  async *run(_brief: Brief, _tools: ToolRegistry): AsyncIterable<EngineEvent> {
    throw new Error("not implemented");
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: true, streaming: true, nativeMCP: false, contextWindow: 200000 },
    };
  }
}
