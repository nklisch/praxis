import type { DebugTraceContext, ToolRegistry } from "@praxis/core/types";

export interface ToolBridgeHandle {
  /** MCP server stdio command. */
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Server name that will appear as `mcp__<serverName>__<toolName>` to the model. */
  serverName: string;
  /** Tool names exposed (without the `mcp__<server>__` prefix). */
  toolNames: string[];
  /** Stop the server. Idempotent. */
  close(): Promise<void>;
}

export interface StartToolBridgeInput {
  registry: ToolRegistry;
  /** Logical server name, used in MCP routing. Default: "praxis". */
  serverName?: string;
  /**
   * Optional getter for the per-turn AbortSignal. Called at tool-dispatch time
   * (inside the MCP handler) so the signal captured is always the one for the
   * current `send()` turn, not a stale prior-turn signal.
   *
   * The adapter stores the current-turn signal on an instance field, sets it at
   * the start of `send()`, and clears it in the `finally`. The getter reads that
   * field so the MCP handler — which is registered once at `open()` but invoked
   * on every tool call — always sees the live signal.
   */
  getSignal?: () => AbortSignal | undefined;
  /**
   * Optional getter for the per-turn debug trace context. Called at dispatch
   * time so long-lived MCP handlers receive the current send() trace.
   */
  getTrace?: () => DebugTraceContext | undefined;
}
