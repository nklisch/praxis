import type { Thread } from "@openai/codex-sdk";
import { Codex } from "@openai/codex-sdk";
import type { EngineConfig } from "@praxis/core/config";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  VisionCapability,
} from "@praxis/core/types";
import { engineError, serializeError } from "@praxis/core/types";
import { startToolBridge } from "../mcp/tool-bridge.js";
import type { ToolBridgeHandle } from "../mcp/types.js";
import type { EngineDeps } from "../types.js";
import { buildTranscriptPreface } from "../util/transcript.js";
import { mapCodexEvent, newMapState } from "./events.js";
import { CodexVision } from "./vision.js";

export interface CodexEngineOptions {
  config: EngineConfig;
  deps: EngineDeps;
}

export class CodexEngine implements Engine {
  readonly id = "codex";
  readonly kind = "looped" as const;
  readonly vision: VisionCapability;
  private readonly opts: CodexEngineOptions;

  constructor(opts: CodexEngineOptions) {
    this.opts = opts;
    this.vision = new CodexVision(opts.config);
  }

  async open(openOpts: EngineOpenOptions): Promise<EngineSession> {
    const bridge: ToolBridgeHandle | null =
      openOpts.tools.list().length > 0 ? await startToolBridge({ registry: openOpts.tools }) : null;
    let thread: Thread;
    let codex: Codex;
    try {
      codex = new Codex({
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
      });
      thread = codex.startThread({
        ...(this.opts.config.model !== undefined && { model: this.opts.config.model }),
        ...(this.opts.config.effort !== undefined && {
          modelReasoningEffort: this.opts.config.effort,
        }),
        approvalPolicy: "never" as const,
        sandboxMode: "read-only" as const,
        skipGitRepoCheck: true,
      });
    } catch (err) {
      if (bridge) {
        await bridge.close().catch((closeErr: unknown) => {
          this.opts.deps.log.warn("engine.codex.open.bridge_close_failed", {
            err: serializeError(closeErr),
          });
        });
      }
      throw err;
    }

    // Codex has no separate system prompt slot — fold it into the seed preface for the first send.
    const transcriptPart = buildTranscriptPreface(openOpts.priorTurns ?? []);
    const seedPreface = transcriptPart
      ? `${openOpts.systemPrompt}\n\n---\n\n${transcriptPart}`
      : `${openOpts.systemPrompt}\n\n---\n\n`;

    return new CodexEngineSession({
      id: (thread as { id?: string | null }).id ?? `codex-${Date.now()}`,
      thread,
      bridge,
      seedPreface,
      serverName: bridge?.serverName ?? "praxis",
      log: this.opts.deps.log,
    });
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: true, nativeMCP: true, contextWindow: 128_000 },
    };
  }
}

interface CodexSessionInit {
  id: string;
  thread: Thread;
  bridge: ToolBridgeHandle | null;
  seedPreface: string;
  serverName: string;
  log: EngineDeps["log"];
}

class CodexEngineSession implements EngineSession {
  readonly id: string;
  private readonly thread: Thread;
  private readonly bridge: ToolBridgeHandle | null;
  private readonly serverName: string;
  private readonly log: EngineDeps["log"];
  private seedPreface: string;
  private closed = false;

  constructor(init: CodexSessionInit) {
    this.id = init.id;
    this.thread = init.thread;
    this.bridge = init.bridge;
    this.serverName = init.serverName;
    this.log = init.log;
    this.seedPreface = init.seedPreface;
  }

  async *send(userMessage: string, signal?: AbortSignal): AsyncIterable<EngineEvent> {
    if (this.closed) {
      yield { type: "error", error: engineError("session.closed", "EngineSession is closed") };
      return;
    }
    // Apply seed preface only on the first send after open.
    const message = this.seedPreface ? `${this.seedPreface}${userMessage}` : userMessage;
    this.seedPreface = "";

    // Pass the AbortSignal to runStreamed — the Codex SDK's TurnOptions honors
    // it to cancel the underlying network request. Best-effort: if the SDK
    // version in use doesn't propagate the signal deep enough to abort a
    // mid-stream turn, SessionServiceImpl's defensive signal?.aborted check
    // still stops the generator on the next yielded event.
    const { events } = await this.thread.runStreamed(message, { signal });
    const state = newMapState();
    const itemIndex = { value: 0 };
    for await (const event of events) {
      const mapped = mapCodexEvent(event, { serverName: this.serverName }, state, itemIndex);
      for (const m of mapped) yield m;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Codex Thread has no close API — the CLI subprocess persists thread state on disk.
    // Drop our reference. Bridge subprocess gets torn down.
    if (this.bridge) {
      await this.bridge.close().catch((err: unknown) => {
        this.log.warn("engine.codex.tool_bridge_close_failed", { err: serializeError(err) });
      });
    }
  }
}
