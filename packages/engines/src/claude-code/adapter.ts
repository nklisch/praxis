import type { Conversation } from "@praxis/claude-cli-sdk";
import { authStatus, createConversation } from "@praxis/claude-cli-sdk";
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
import { createEventState, mapClaudeCodeEvent } from "./events.js";
import { ClaudeCodeVision } from "./vision.js";

/**
 * Default turn cap applied when the caller omits `maxSteps` on EngineOpenOptions.
 * Generous enough for any normal session, well below a runaway-loop threshold.
 * Defense-in-depth: pairs with `timeout: 0` so an unbounded caller still cannot
 * trigger an infinite agent loop — see gate-security-sdk-timeout-disabled-defense-in-depth.
 */
const DEFAULT_MAX_TURNS = 100;

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
    // Precheck auth so the user gets a clean error instead of a downstream
    // CLI failure or hung subprocess. The error message uses a stable prefix
    // the desktop IPC layer recognizes and the renderer matches on.
    const status = await authStatus();
    if (!status.loggedIn) {
      throw new Error(`claude.auth.required: ${status.error ?? "claude CLI is not signed in"}`);
    }

    // `currentSignal` is set at the start of each `send()` turn and cleared in
    // the finally. The bridge's MCP handler reads it via this getter so every
    // tool-call dispatch receives the live per-turn signal even though the handler
    // was registered once at open() time.
    let currentSignal: AbortSignal | undefined;
    const getSignal = (): AbortSignal | undefined => currentSignal;

    const bridge: ToolBridgeHandle | null =
      openOpts.tools.list().length > 0
        ? await startToolBridge({ registry: openOpts.tools, getSignal })
        : null;

    let realSessionId: string | undefined;
    let conv: Conversation;
    try {
      const modelHint = this.modelHint();
      conv = createConversation({
        ...(modelHint !== undefined && { model: modelHint }),
        // Always set maxTurns: caller value if provided, else DEFAULT_MAX_TURNS.
        // This pairs with timeout: 0 below as defense-in-depth — no caller
        // omitting maxSteps can produce an unbounded conversation.
        maxTurns: openOpts.maxSteps ?? DEFAULT_MAX_TURNS,
        // Disable the SDK's per-turn wall-clock timeout. The adapter ensures a
        // turn cap is always set via maxTurns (see above), and explicit
        // cancellation flows through `signal` → `conv.abort()` in
        // `ClaudeCodeEngineSession.send`. The SDK's 10-minute default would
        // kill legitimate long-running turns — notably the drafter
        // reading large textbook bundles — producing a CLITimeoutError that
        // the student sees as an opaque failure mid-course-build.
        timeout: 0,
        systemPrompt: openOpts.systemPrompt,
        // Native resume — preferred over priorTurns text-splice when available.
        ...(openOpts.resumeEngineSessionId !== undefined && {
          resume: openOpts.resumeEngineSessionId,
        }),
        // Block ALL Claude Code built-in tools (AskUserQuestion, Bash, Read,
        // Edit, Write, Glob, Grep, WebFetch, WebSearch, Task, TodoWrite, …).
        // Praxis only exposes its first-party tools through the MCP bridge;
        // built-ins like AskUserQuestion can't be serviced — the CLI subprocess
        // has no TTY and no toolHandlers are registered — so the model calling
        // them produces a "Couldn't finish askuserquestion." interstitial and
        // the tutor degrades into improvised text apologies. `tools: "none"`
        // takes the door off the hinges for built-ins; MCP tools registered
        // via `mcpServers` below remain available.
        tools: "none",
        // permissionMode defaults to "bypassPermissions" via the SDK when
        // mcpServers is set (see resolvePermissionMode in cli/args.ts).
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
        onSessionReady: (id) => {
          realSessionId = id;
          this.opts.deps.log.info("engine.claude-code.session_ready", { sessionId: id });
          openOpts.onEngineSessionReady?.(id);
        },
      });
    } catch (err) {
      if (bridge) {
        await bridge.close().catch((closeErr: unknown) => {
          this.opts.deps.log.warn("engine.claude-code.open.bridge_close_failed", {
            err: serializeError(closeErr),
          });
        });
      }
      throw err;
    }

    // Placeholder id used until the CLI emits its init event (which fires the
    // onSessionReady callback above). The real id is surfaced via the getter on
    // ClaudeCodeEngineSession once the callback fires.
    const placeholderId = `claude-code-${Date.now()}`;

    // Cross-engine fallback: build a transcript preface only when no native
    // resume is available. When resumeEngineSessionId is set, the CLI session
    // already has the full history — no preface needed.
    const seedPreface =
      openOpts.resumeEngineSessionId === undefined
        ? buildTranscriptPreface(openOpts.priorTurns ?? [])
        : "";

    if (openOpts.resumeEngineSessionId !== undefined && openOpts.priorTurns?.length) {
      this.opts.deps.log.warn("engine.claude-code.open.resume_and_prior_turns_both_set", {
        detail: "resumeEngineSessionId takes precedence; priorTurns ignored",
        resumeEngineSessionId: openOpts.resumeEngineSessionId,
      });
    }

    return new ClaudeCodeEngineSession({
      placeholderId,
      getRealId: () => realSessionId,
      conv,
      bridge,
      seedPreface,
      serverName: bridge?.serverName ?? "praxis",
      log: this.opts.deps.log,
      // Setter for the per-turn signal. The session writes the current turn's
      // signal here at the start of send() and clears it in finally; the bridge's
      // MCP handler reads it via getSignal() so dispatch always carries the live value.
      setCurrentSignal: (s) => {
        currentSignal = s;
      },
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
  placeholderId: string;
  /** Returns the real CLI session id once the init event fires; undefined before then. */
  getRealId: () => string | undefined;
  conv: Conversation;
  bridge: ToolBridgeHandle | null;
  /** Transcript prefix applied to the FIRST send only (when seeded with priorTurns). */
  seedPreface: string;
  serverName: string;
  log: EngineDeps["log"];
  /**
   * Setter for the per-turn AbortSignal. The session writes the current signal
   * at the start of `send()` (set) and clears it in the finally (undefined).
   * The bridge's MCP handler reads it via the paired `getSignal` getter so every
   * tool-call dispatch carries the live value for the current turn.
   */
  setCurrentSignal: (signal: AbortSignal | undefined) => void;
}

class ClaudeCodeEngineSession implements EngineSession {
  private readonly placeholderId: string;
  private readonly getRealId: () => string | undefined;
  private readonly conv: Conversation;
  private readonly bridge: ToolBridgeHandle | null;
  private readonly serverName: string;
  private readonly log: EngineDeps["log"];
  private readonly setCurrentSignal: (signal: AbortSignal | undefined) => void;
  private seedPreface: string;
  private closed = false;
  // Per-session (not per-send) state for callId translation. The MCP bridge
  // worker spawns once per Conversation (lazily on first send) and its
  // callCounter persists across all turns — so we must mirror that lifetime
  // here. A fresh state per send() would diverge starting on turn 2+ in any
  // conversation with multiple tool-calling turns.
  private readonly eventState = createEventState();

  constructor(init: ClaudeCodeSessionInit) {
    this.placeholderId = init.placeholderId;
    this.getRealId = init.getRealId;
    this.conv = init.conv;
    this.bridge = init.bridge;
    this.serverName = init.serverName;
    this.log = init.log;
    this.seedPreface = init.seedPreface;
    this.setCurrentSignal = init.setCurrentSignal;
  }

  /** Returns the real CLI session id once the init event fires; falls back to placeholder. */
  get id(): string {
    return this.getRealId() ?? this.placeholderId;
  }

  async *send(userMessage: string, signal?: AbortSignal): AsyncIterable<EngineEvent> {
    if (this.closed) {
      yield { type: "error", error: engineError("session.closed", "EngineSession is closed") };
      return;
    }
    // Apply seed preface only on the first send after a priorTurns-seeded open.
    const message = this.seedPreface ? `${this.seedPreface}${userMessage}` : userMessage;
    this.seedPreface = "";

    // Publish the per-turn signal so the MCP bridge's tool-call handlers can
    // thread it into registry.dispatch. Cleared in finally so no stale signal
    // leaks into subsequent turns.
    this.setCurrentSignal(signal);

    const turn = this.conv.send(message);

    // Wire the AbortSignal → conv.abort(). One-shot listener so the handler
    // fires at most once even if the signal is reused.
    const onAbort = (): void => {
      try {
        this.conv.abort();
      } catch (err) {
        this.log.warn("engine.claude-code.abort_failed", { err: serializeError(err) });
      }
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    try {
      // Use the session-scoped event state. The MCP bridge worker spawns once
      // per Conversation and its callCounter persists across all turns; the
      // adapter's mirror counter must persist for the same lifetime to keep
      // both channels aligned (see this.eventState declaration).
      for await (const event of turn) {
        const mapped = mapClaudeCodeEvent(event, { serverName: this.serverName }, this.eventState);
        if (mapped) yield mapped;
      }

      // Drain `turn.result` so unhandled rejection isn't logged. The final event
      // already flowed through the stream above (the SDK guarantees a result
      // event ends every turn — see TurnResult.resultEvent contract in the SDK).
      await turn.result.catch(() => {});
    } finally {
      signal?.removeEventListener("abort", onAbort);
      // Clear the per-turn signal so a stale aborted signal doesn't bleed into
      // the next turn (e.g. if the session is reused after an abort).
      this.setCurrentSignal(undefined);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.conv.close().catch((err: unknown) => {
      this.log.warn("engine.claude-code.conversation_close_failed", { err: serializeError(err) });
    });
    if (this.bridge) {
      await this.bridge.close().catch((err: unknown) => {
        this.log.warn("engine.claude-code.tool_bridge_close_failed", { err: serializeError(err) });
      });
    }
  }
}
