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
 * @typeParam TOutput - The Zod-inferred output type for the handler (when `outputSchema` is set).
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  /** Tool name (becomes `mcp__sdk__<name>` in the CLI session). */
  name: string;
  /** Description shown to the model to help it decide when to use this tool. */
  description: string;
  /** Zod schema defining and validating the tool's input parameters. */
  inputSchema: z.ZodType<TInput>;
  /**
   * Optional Zod schema for the handler's `value` on success. When set, the
   * SDK validates handler returns at the wire boundary and returns
   * `{ success: false, error: "..." }` on failure instead of forwarding a
   * malformed value to the model.
   */
  outputSchema?: z.ZodType<TOutput>;
  /** Handler function called when the model invokes this tool. */
  handler: (
    input: TInput,
    meta: { callId: string },
  ) => Promise<ToolResult<TOutput>> | ToolResult<TOutput>;
}

/**
 * Return value from a custom tool handler.
 *
 * - `{ success: true, value }` — Tool succeeded; `value` is sent to the model.
 *   The SDK JSON-stringifies `value` internally for the MCP wire — pass any
 *   structured object, array, primitive, or string directly.
 * - `{ success: false, error: '...' }` — Tool failed; the error message goes
 *   back to the model with `isError: true`.
 *
 * @typeParam TOutput - The type of the success value (defaults to `unknown`).
 */
export type ToolResult<TOutput = unknown> =
  | { success: true; value: TOutput }
  | { success: false; error: string };

// ============================================
// TOOL HANDLERS (for intercepting tool calls)
// ============================================

/**
 * Return value from a {@link ToolHandler}.
 *
 * - Any value — sent to the model as the tool result. The SDK JSON-stringifies
 *   internally for the MCP wire.
 * - `{ value, isError? }` — explicit form when you need to signal an error
 *   without throwing (e.g. expected validation failure that the model should
 *   handle gracefully).
 *
 * To signal an error from the handler, either return `{ value, isError: true }`
 * or throw — the SDK catches throws and reports them as `isError`.
 */
export type ToolHandlerResult = unknown | { value: unknown; isError?: boolean };

/**
 * Async handler for intercepting tool calls in a conversation.
 *
 * Register via `toolHandlers` in {@link ConversationOptions}. When the model
 * calls a tool whose name matches a handler key, the SDK invokes this handler
 * instead of letting the CLI execute it, then sends the result back to the model.
 *
 * @param event - The {@link ToolUseEvent} containing tool name, ID, and input.
 * @returns The result to send back to the model — bare value for success,
 *   `{ value, isError: true }` for an explicit error, or throw for an unexpected one.
 *
 * @example
 * const handler: ToolHandler = async (event) => {
 *   const input = event.toolInput as { query: string };
 *   return await mySearch(input.query); // returns whatever shape mySearch produces
 * };
 */
export type ToolHandler = (event: import("./events.js").ToolUseEvent) => Promise<ToolHandlerResult>;
