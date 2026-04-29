import type { Conversation } from "@nklisch/claude-cli-sdk";
import { createConversation } from "@nklisch/claude-cli-sdk";
import type { EngineConfig } from "@praxis/core/config";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  VisionCapability,
} from "@praxis/core/types";
import { engineError } from "@praxis/core/types";
import { startToolBridge } from "../mcp/tool-bridge.js";
import type { ToolBridgeHandle } from "../mcp/types.js";
import type { EngineDeps } from "../types.js";
import { buildTranscriptPreface } from "../util/transcript.js";
import { mapClaudeCodeEvent } from "./events.js";
import { ClaudeCodeVision } from "./vision.js";

export interface ClaudeCodeEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
}

export class ClaudeCodeEngine implements Engine {
  readonly id = "claude-code";
  readonly kind = "looped" as const;
  readonly vision: VisionCapability = new ClaudeCodeVision();
  private readonly opts: ClaudeCodeEngineOptions;

  constructor(opts: ClaudeCodeEngineOptions) {
    this.opts = opts;
  }

  async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
    const bridge: ToolBridgeHandle | null =
      openOpts.tools.list().length > 0 ? await startToolBridge({ registry: openOpts.tools }) : null;
    let conv: Conversation;
    try {
      const modelHint = this.modelHint();
      conv = createConversation({
        ...(modelHint !== undefined && { model: modelHint }),
        ...(openOpts.maxSteps !== undefined && { maxTurns: openOpts.maxSteps }),
        systemPrompt: openOpts.systemPrompt,
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
    } catch (err) {
      if (bridge) await bridge.close().catch(() => {});
      throw err;
    }

    const sessionId = await conv.sessionId.catch(() => `claude-code-${Date.now()}`);
    const seedPreface = buildTranscriptPreface(openOpts.priorTurns ?? []);

    return new ClaudeCodeEngineSession({
      id: sessionId,
      conv,
      bridge,
      seedPreface,
      serverName: bridge?.serverName ?? "praxis",
    });
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

interface ClaudeCodeSessionInit {
  id: string;
  conv: Conversation;
  bridge: ToolBridgeHandle | null;
  /** Transcript prefix applied to the FIRST send only (when seeded with priorTurns). */
  seedPreface: string;
  serverName: string;
}

class ClaudeCodeEngineSession implements EngineSession {
  readonly id: string;
  private readonly conv: Conversation;
  private readonly bridge: ToolBridgeHandle | null;
  private readonly serverName: string;
  private seedPreface: string;
  private closed = false;

  constructor(init: ClaudeCodeSessionInit) {
    this.id = init.id;
    this.conv = init.conv;
    this.bridge = init.bridge;
    this.serverName = init.serverName;
    this.seedPreface = init.seedPreface;
  }

  async *send(userMessage: string): AsyncIterable<EngineEvent> {
    if (this.closed) {
      yield { type: "error", error: engineError("session.closed", "EngineSession is closed") };
      return;
    }
    // Apply seed preface only on the first send after a priorTurns-seeded open.
    const message = this.seedPreface ? `${this.seedPreface}${userMessage}` : userMessage;
    this.seedPreface = "";

    const turn = this.conv.send(message);
    for await (const event of turn) {
      const mapped = mapClaudeCodeEvent(event, { serverName: this.serverName });
      if (mapped) yield mapped;
    }

    const result = await turn.result;
    // The SDK's `result` event flows through the stream; if it didn't, synthesize a final.
    if (!result.resultEvent) {
      yield {
        type: "final",
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.conv.close().catch(() => {});
    if (this.bridge) await this.bridge.close().catch(() => {});
  }
}
