import type { EngineConfig } from "@praxis/core/config";
import type { Brief, Engine, EngineEvent, HealthStatus, ToolRegistry } from "@praxis/core/types";
import { stepCountIs, streamText } from "ai";
import type { EngineDeps } from "../types.js";
import { mapVercelPart } from "./events.js";
import { type DirectProvider, resolveModel } from "./providers.js";
import { toVercelTools } from "./tool-conversion.js";

export interface DirectEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
  provider: DirectProvider;
}

export class DirectEngine implements Engine {
  readonly id: string;
  readonly kind = "single-shot" as const;
  private readonly opts: DirectEngineOptions;

  constructor(opts: DirectEngineOptions) {
    this.opts = opts;
    this.id = `direct.${opts.provider}`;
  }

  async *run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent> {
    const model = resolveModel(this.opts.provider, this.opts.config);
    const result = streamText({
      model,
      system: brief.systemPrompt,
      messages: [{ role: "user", content: brief.userMessage }],
      tools: toVercelTools(tools),
      stopWhen: stepCountIs(brief.maxSteps ?? 8),
      ...(brief.generation?.temperature !== undefined && {
        temperature: brief.generation.temperature,
      }),
      ...(brief.generation?.maxTokens !== undefined && {
        maxOutputTokens: brief.generation.maxTokens,
      }),
    });
    const state = { textBuf: "" };
    for await (const part of result.fullStream) {
      const event = mapVercelPart(part, state);
      if (event) yield event;
    }
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: true, streaming: true, nativeMCP: false, contextWindow: 200_000 },
    };
  }
}
