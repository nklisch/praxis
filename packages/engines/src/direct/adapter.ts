import type { EngineConfig } from "@praxis/core/config";
import type {
  DebugTraceContext,
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  GenerationParams,
  HealthStatus,
  VisionCapability,
} from "@praxis/core/types";
import type { ModelMessage } from "ai";
import { stepCountIs, streamText } from "ai";
import { v7 as uuidv7 } from "uuid";
import type { EngineDeps } from "../types.js";
import { mapVercelPart } from "./events.js";
import { type DirectProvider, resolveModel } from "./providers.js";
import { toVercelTools } from "./tool-conversion.js";
import { DirectVision } from "./vision.js";

export interface DirectEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
  provider: DirectProvider;
}

export class DirectEngine implements Engine {
  readonly id: string;
  readonly kind = "single-shot" as const;
  readonly vision: VisionCapability;
  private readonly opts: DirectEngineOptions;

  constructor(opts: DirectEngineOptions) {
    this.opts = opts;
    this.id = `direct.${opts.provider}`;
    this.vision = new DirectVision(opts.provider, opts.config);
  }

  async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
    return new DirectEngineSession({
      id: uuidv7(),
      provider: this.opts.provider,
      config: this.opts.config,
      systemPrompt: openOpts.systemPrompt,
      tools: openOpts.tools,
      priorTurns: openOpts.priorTurns ?? [],
      ...(openOpts.maxSteps !== undefined && { maxSteps: openOpts.maxSteps }),
      ...(openOpts.generation !== undefined && { generation: openOpts.generation }),
    });
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: true, streaming: true, nativeMCP: false, contextWindow: 200_000 },
    };
  }
}

interface DirectSessionInit {
  id: string;
  provider: DirectProvider;
  config: EngineConfig;
  systemPrompt: string;
  tools: EngineOpenOptions["tools"];
  priorTurns: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  maxSteps?: number;
  generation?: GenerationParams;
}

class DirectEngineSession implements EngineSession {
  readonly id: string;
  private readonly provider: DirectProvider;
  private readonly config: EngineConfig;
  private readonly systemPrompt: string;
  private readonly tools: EngineOpenOptions["tools"];
  private readonly maxSteps: number;
  private readonly generation?: GenerationParams;
  private messages: ModelMessage[];

  constructor(init: DirectSessionInit) {
    this.id = init.id;
    this.provider = init.provider;
    this.config = init.config;
    this.systemPrompt = init.systemPrompt;
    this.tools = init.tools;
    this.maxSteps = init.maxSteps ?? 8;
    if (init.generation !== undefined) this.generation = init.generation;
    this.messages = init.priorTurns.map((t) => ({ role: t.role, content: t.content }));
  }

  async *send(
    userMessage: string,
    signal?: AbortSignal,
    trace?: DebugTraceContext,
  ): AsyncIterable<EngineEvent> {
    this.messages.push({ role: "user", content: userMessage });
    const model = resolveModel(this.provider, this.config);
    // The Vercel AI SDK's streamText accepts abortSignal to cancel the
    // underlying HTTP request mid-stream. Signal is threaded best-effort;
    // SessionServiceImpl's defensive signal?.aborted check backstops adapters
    // that can't cancel in-flight.
    //
    // Thread the per-turn signal into tool dispatch via a getter closure that
    // captures the current send()'s signal. `toVercelTools` passes it into each
    // tool's `execute` callback so handlers and sub-agent spawners can bail early
    // when the user clicks Stop.
    const getSignal = (): AbortSignal | undefined => signal;
    const getTrace = (): DebugTraceContext | undefined => trace;
    const result = streamText({
      model,
      system: this.systemPrompt,
      messages: this.messages,
      tools: toVercelTools(this.tools, getSignal, getTrace),
      stopWhen: stepCountIs(this.maxSteps),
      ...(signal !== undefined && { abortSignal: signal }),
      ...(this.generation?.temperature !== undefined && {
        temperature: this.generation.temperature,
      }),
      ...(this.generation?.maxTokens !== undefined && {
        maxOutputTokens: this.generation.maxTokens,
      }),
    });

    const state = { textBuf: "" };
    let assistantContent = "";
    for await (const part of result.fullStream) {
      const event = mapVercelPart(part, state);
      if (!event) continue;
      if (event.type === "model_message" && event.partial !== true) {
        assistantContent += event.content;
      }
      yield event;
    }

    if (assistantContent.length > 0) {
      this.messages.push({ role: "assistant", content: assistantContent });
    }
  }

  async close(): Promise<void> {
    // Nothing to tear down — the underlying SDK is stateless.
    this.messages = [];
  }
}
