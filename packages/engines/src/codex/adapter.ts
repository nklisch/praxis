import { Codex } from "@openai/codex-sdk";
import type { EngineConfig } from "@praxis/core/config";
import type { Brief, Engine, EngineEvent, HealthStatus, ToolRegistry } from "@praxis/core/types";
import { startToolBridge } from "../mcp/tool-bridge.js";
import type { ToolBridgeHandle } from "../mcp/types.js";
import type { EngineDeps } from "../types.js";
import { mapCodexEvent, newMapState } from "./events.js";

export interface CodexEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
}

export class CodexEngine implements Engine {
  readonly id = "codex";
  readonly kind = "looped" as const;
  private readonly opts: CodexEngineOptions;

  constructor(opts: CodexEngineOptions) {
    this.opts = opts;
  }

  async *run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent> {
    const bridge: ToolBridgeHandle | null =
      tools.list().length > 0 ? await startToolBridge({ registry: tools }) : null;
    try {
      const codexOpts = {
        ...(this.opts.config.apiKey !== undefined && { apiKey: this.opts.config.apiKey }),
        ...(this.opts.config.baseUrl !== undefined && { baseUrl: this.opts.config.baseUrl }),
        ...(bridge && {
          config: {
            mcp_servers: {
              [bridge.serverName]: {
                command: bridge.command,
                args: bridge.args,
                env: bridge.env,
              },
            },
          },
        }),
      };
      const codex = new Codex(codexOpts);
      const threadOpts = {
        ...(this.opts.config.model !== undefined && { model: this.opts.config.model }),
        ...(this.opts.config.effort !== undefined && {
          modelReasoningEffort: this.opts.config.effort,
        }),
        approvalPolicy: "never" as const,
        sandboxMode: "read-only" as const,
        skipGitRepoCheck: true,
      };
      const thread = codex.startThread(threadOpts);
      const userMessage = `${brief.systemPrompt}\n\n---\n\nUser: ${brief.userMessage}`;
      const { events } = await thread.runStreamed(userMessage);
      const state = newMapState();
      const itemIndex = { value: 0 };
      for await (const event of events) {
        const mapped = mapCodexEvent(
          event,
          { serverName: bridge?.serverName ?? "praxis" },
          state,
          itemIndex,
        );
        for (const m of mapped) yield m;
      }
    } finally {
      if (bridge) await bridge.close().catch(() => {});
    }
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: true, nativeMCP: true, contextWindow: 128_000 },
    };
  }
}
