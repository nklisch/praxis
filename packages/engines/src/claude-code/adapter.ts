import { createConversation } from "@nklisch/claude-cli-sdk";
import type { EngineConfig } from "@praxis/core/config";
import type { Brief, Engine, EngineEvent, HealthStatus, ToolRegistry } from "@praxis/core/types";
import { startToolBridge } from "../mcp/tool-bridge.js";
import type { ToolBridgeHandle } from "../mcp/types.js";
import type { EngineDeps } from "../types.js";
import { mapClaudeCodeEvent } from "./events.js";

export interface ClaudeCodeEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
}

export class ClaudeCodeEngine implements Engine {
  readonly id = "claude-code";
  readonly kind = "looped" as const;
  private readonly opts: ClaudeCodeEngineOptions;

  constructor(opts: ClaudeCodeEngineOptions) {
    this.opts = opts;
  }

  async *run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent> {
    const bridge: ToolBridgeHandle | null =
      tools.list().length > 0 ? await startToolBridge({ registry: tools }) : null;
    try {
      const modelHint = this.modelHint();
      const conv = createConversation({
        ...(modelHint !== undefined && { model: modelHint }),
        ...(brief.maxSteps !== undefined && { maxTurns: brief.maxSteps }),
        systemPrompt: brief.systemPrompt,
        mcpServers: bridge
          ? {
              [bridge.serverName]: {
                type: "stdio",
                command: bridge.command,
                args: bridge.args,
                env: bridge.env,
              },
            }
          : {},
      });
      try {
        const turn = conv.send(brief.userMessage);
        for await (const event of turn) {
          const mapped = mapClaudeCodeEvent(event, { serverName: bridge?.serverName ?? "praxis" });
          if (mapped) yield mapped;
        }
        const result = await turn.result;
        // The SDK's `result` event flows through the stream; if it didn't, synthesize a final.
        // (Defensive: most cases yield via the stream.)
        if (!result.resultEvent) {
          yield {
            type: "final",
            usage: { inputTokens: 0, outputTokens: 0 },
          };
        }
      } finally {
        await conv.close().catch(() => {});
      }
    } finally {
      if (bridge) await bridge.close().catch(() => {});
    }
  }

  private modelHint(): "haiku" | "sonnet" | "opus" | undefined {
    const m = this.opts.config.model;
    if (!m) return undefined;
    if (m.includes("haiku")) return "haiku";
    if (m.includes("opus")) return "opus";
    if (m.includes("sonnet")) return "sonnet";
    return undefined;
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: true, streaming: true, nativeMCP: true, contextWindow: 200_000 },
    };
  }
}
