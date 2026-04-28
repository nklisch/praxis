import type { ToolDefinition as CCToolDefinition } from "@nklisch/claude-cli-sdk";
import { startToolServer, tool } from "@nklisch/claude-cli-sdk";
import type { ToolDefinitionSummary, ToolRegistry } from "@praxis/core/types";
import { z } from "zod";
import { jsonSchemaToZod } from "../util/json-schema-to-zod.js";
import type { StartToolBridgeInput, ToolBridgeHandle } from "./types.js";

/**
 * Spawn an in-process stdio MCP server that exposes every tool in `registry`.
 * Used by the Claude Code adapter and the Codex adapter — both pass the
 * resulting `{ command, args, env }` to their SDK as an MCP server config.
 *
 * Implementation note: we reuse the Claude Code SDK's `startToolServer` helper
 * (which itself wraps @modelcontextprotocol/sdk) so we don't maintain a second
 * MCP server implementation. Tool dispatch routes back through the Praxis
 * `ToolRegistry.dispatch` — single source of truth.
 */
export async function startToolBridge(input: StartToolBridgeInput): Promise<ToolBridgeHandle> {
  const serverName = input.serverName ?? "praxis";
  const summaries = input.registry.list();
  const sdkTools: CCToolDefinition[] = summaries.map((summary) =>
    buildSdkTool(summary, input.registry),
  );

  const handle = await startToolServer(sdkTools);
  return {
    command: handle.command,
    args: handle.args,
    env: handle.env,
    serverName,
    toolNames: summaries.map((s) => s.name),
    close: () => handle.close(),
  };
}

function buildSdkTool(summary: ToolDefinitionSummary, registry: ToolRegistry): CCToolDefinition {
  const inputSchema = resolveInputSchema(summary);
  return tool(summary.name, summary.description, inputSchema, async (input: unknown) => {
    const result = await registry.dispatch(summary.name, input);
    if (result.ok) {
      return { success: true, content: JSON.stringify(result.value) };
    }
    return { success: false, error: result.error.message };
  });
}

function resolveInputSchema(summary: ToolDefinitionSummary): z.ZodType<unknown> {
  if (summary.inputSchemaNative instanceof z.ZodType) {
    return summary.inputSchemaNative;
  }
  return jsonSchemaToZod(summary.inputSchemaJson);
}
