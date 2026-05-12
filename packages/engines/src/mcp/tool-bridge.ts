import type { ToolDefinition as CCToolDefinition } from "@praxis/claude-cli-sdk";
import { startToolServer, tool } from "@praxis/claude-cli-sdk";
import type { ToolDefinitionSummary, ToolRegistry } from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
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
    // The @modelcontextprotocol/sdk does NOT surface the MCP request id through
    // the `tool()` callback. The worker script in @praxis/claude-cli-sdk/tool-server.ts
    // uses its own sequential callCounter ("1", "2", …) as the wire id, but that id
    // never reaches this callback — only `input` is passed. We therefore generate a
    // uuidv7 here as the callId so both the registry and the ToolContext agree on the
    // same id. This is Risk #2 from the feature design (MCP callId surfacing fallback).
    const callId = uuidv7();
    const result = await registry.dispatch(summary.name, input, { callId });
    if (result.ok) {
      // Pass the structured value directly — the SDK JSON-stringifies at the
      // MCP wire boundary and the receive-side parser inverts that, so
      // consumers see the original object/array/primitive without any manual
      // serialization in this layer.
      return { success: true, value: result.value };
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
