import type { z } from "zod";
import type { ResultEvent, StreamEvent } from "./events.js";

// ============================================
// QUERY (async generator with extras)
// ============================================

/**
 * Return type of {@link query} — an async generator of {@link StreamEvent} values
 * with convenience accessors for the session ID and final result.
 *
 * **Usage patterns:**
 *
 * 1. **Stream events** — iterate with `for await`:
 *    ```ts
 *    const q = query('Hello', { maxTurns: 1 });
 *    for await (const event of q) { ... }
 *    ```
 *
 * 2. **Just get the result** — skip streaming:
 *    ```ts
 *    const q = query('Hello', { maxTurns: 1 });
 *    const result = await collectResult(q);
 *    ```
 *
 * 3. **Abort** — cancel a running query:
 *    ```ts
 *    q.abort(); // sends SIGTERM to the CLI process
 *    ```
 *
 * Implements `AsyncDisposable` — use `await using q = query(...)` for auto-cleanup.
 */
export interface Query extends AsyncGenerator<StreamEvent, ResultEvent, unknown> {
  /** Resolves with the session UUID once the `SystemInitEvent` arrives. */
  readonly sessionId: Promise<string>;
  /** Resolves with the final {@link ResultEvent} when the query completes. */
  readonly result: Promise<ResultEvent>;
  /** Abort the running query by killing the CLI process (SIGTERM). */
  abort(): void;
}

// ============================================
// TOOL DEFINITIONS (for custom tools via MCP)
// ============================================

/**
 * A custom tool definition for injection via the ephemeral MCP server.
 *
 * Create with the {@link tool} factory. Pass an array of these to
 * `tools.custom` in your options, or to {@link startToolServer} directly.
 *
 * Custom tool names appear as `mcp__sdk__<name>` in the session.
 *
 * @typeParam TInput - The Zod-inferred input type for the handler.
 */
export interface ToolDefinition<TInput = unknown> {
  /** Tool name (becomes `mcp__sdk__<name>` in the CLI session). */
  name: string;
  /** Description shown to the model to help it decide when to use this tool. */
  description: string;
  /** Zod schema defining and validating the tool's input parameters. */
  inputSchema: z.ZodType<TInput>;
  /** Handler function called when the model invokes this tool. */
  handler: (input: TInput) => Promise<ToolResult> | ToolResult;
}

/**
 * Return value from a custom tool handler.
 *
 * - `{ success: true, content: '...' }` — Tool succeeded, content returned to model.
 * - `{ success: false, error: '...' }` — Tool failed, error message returned to model.
 */
export type ToolResult = { success: true; content: string } | { success: false; error: string };

// ============================================
// TOOL HANDLERS (for intercepting tool calls)
// ============================================

/**
 * Return value from a {@link ToolHandler}.
 *
 * - `string` — Sent as the tool result content (no error).
 * - `{ content, isError? }` — Full control over result content and error flag.
 */
export type ToolHandlerResult = string | { content: string; isError?: boolean };

/**
 * Async handler for intercepting tool calls in a conversation.
 *
 * Register via `toolHandlers` in {@link ConversationOptions}. When the model
 * calls a tool whose name matches a handler key, the SDK invokes this handler
 * instead of letting the CLI execute it, then sends the result back to the model.
 *
 * @param event - The {@link ToolUseEvent} containing tool name, ID, and input.
 * @returns The result to send back to the model.
 *
 * @example
 * const handler: ToolHandler = async (event) => {
 *   const input = event.toolInput as { query: string };
 *   return { content: await mySearch(input.query) };
 * };
 */
export type ToolHandler = (event: import("./events.js").ToolUseEvent) => Promise<ToolHandlerResult>;
