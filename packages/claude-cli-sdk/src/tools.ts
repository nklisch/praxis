import type { z } from "zod";
import type { ToolDefinition, ToolResult } from "./types/index.js";

/**
 * Create a typed {@link ToolDefinition} for custom tool injection.
 *
 * Pass an array of tool definitions to `tools.custom` in your options.
 * The SDK spins up an ephemeral MCP server and the tools appear as
 * `mcp__sdk__<name>` in the session.
 *
 * **Requires**: `@modelcontextprotocol/sdk` peer dependency installed.
 * **Only works with**: `createConversation()` (not `query()`).
 *
 * @param name - Tool name (appears as `mcp__sdk__<name>`).
 * @param description - Description shown to the model.
 * @param inputSchema - Zod schema defining and validating input parameters.
 * @param handler - Function called when the model invokes this tool.
 * @returns A {@link ToolDefinition} object.
 *
 * @example
 * const searchTool = tool(
 *   'search_web',
 *   'Search the web for current information',
 *   z.object({ query: z.string() }),
 *   async ({ query }) => {
 *     const results = await webSearch(query);
 *     return { success: true, value: { results, query } };
 *   }
 * );
 *
 * await using conv = createConversation({
 *   tools: { custom: [searchTool] },
 * });
 */
export function tool<TInput, TOutput = unknown>(
  name: string,
  description: string,
  inputSchema: z.ZodType<TInput>,
  handler: (input: TInput) => Promise<ToolResult<TOutput>> | ToolResult<TOutput>,
  outputSchema?: z.ZodType<TOutput>,
): ToolDefinition<TInput, TOutput> {
  return outputSchema
    ? { name, description, inputSchema, handler, outputSchema }
    : { name, description, inputSchema, handler };
}
