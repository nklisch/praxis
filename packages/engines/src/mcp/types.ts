import type { ToolRegistry } from "@praxis/core/types";

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
}
