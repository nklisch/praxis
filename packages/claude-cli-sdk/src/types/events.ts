// ============================================
// STREAM EVENTS
// ============================================
// Events are emitted in order: SystemInitEvent → AssistantTextEvent/ToolUseEvent/
// ToolResultEvent (interleaved) → ResultEvent. A RateLimitEvent may appear at any time.
// ============================================

/** Connection status of an MCP server reported in the init event. */
export interface McpServerStatus {
  /** MCP server name (matches the key in `mcpServers` config). */
  name: string;
  /** Connection status. Known values: `'connected'`, `'failed'`, `'pending'`, `'needs-auth'`. */
  status: 'connected' | 'failed' | 'pending' | 'needs-auth' | string;
}

/**
 * First event emitted — session metadata and available tools.
 *
 * Emitted once at the start of every query or conversation turn.
 * Access `sessionId` here or via `query.sessionId` / `conv.sessionId`.
 */
export interface SystemInitEvent {
  type: 'system';
  subtype: 'init';
  /** Session UUID. Same across all turns of a conversation. */
  sessionId: string;
  /** Resolved model ID (e.g. `'claude-sonnet-4-6-20250514'`). */
  model?: string;
  /** Names of all available tools (built-in + MCP + custom). */
  tools?: string[];
  /** Working directory the CLI resolved. */
  cwd?: string;
  /** MCP server connection statuses. */
  mcpServers?: McpServerStatus[];
  /** Permission mode active for this session. */
  permissionMode?: string;
  /** Claude Code CLI version string. */
  claudeCodeVersion?: string;
  /** Named sub-agents configured via `agents` option. */
  agents?: string[];
  /** Loaded skills/slash commands. */
  skills?: string[];
  /** Loaded plugins. */
  plugins?: string[];
  /** Fast mode state. */
  fastModeState?: string;
}

/**
 * Text output from the assistant.
 *
 * For streaming, check `delta` for the incremental chunk.
 * `text` contains the full accumulated content block so far.
 */
export interface AssistantTextEvent {
  type: 'assistant';
  /** Full accumulated text content block. */
  text: string;
  /** Incremental text chunk (present during streaming). */
  delta?: string;
}

/**
 * The model is invoking a tool.
 *
 * Emitted when the model decides to call a tool. The tool executes asynchronously
 * and the result appears as a subsequent {@link ToolResultEvent}.
 *
 * To intercept a tool call in a conversation, check `toolName` against your
 * handlers and respond via {@link Conversation.sendToolResult}.
 */
export interface ToolUseEvent {
  type: 'tool_use';
  /** Tool name (e.g. `'Read'`, `'Bash'`, `'mcp__github__read_file'`). */
  toolName: string;
  /** Unique ID for this tool invocation — use in `sendToolResult`. */
  toolId: string;
  /** Tool input arguments (shape depends on the tool). */
  toolInput: unknown;
}

/**
 * Result of a tool execution.
 *
 * Emitted after a {@link ToolUseEvent} completes. When `isError` is `true`,
 * the tool call failed and `content` contains the error message.
 */
export interface ToolResultEvent {
  type: 'tool_result';
  /** Matches the `toolId` from the corresponding {@link ToolUseEvent}. */
  toolId?: string;
  /** Tool output content (text). */
  content?: string;
  /** `true` if the tool call failed. */
  isError?: boolean;
}

/**
 * Aggregate token usage for the session.
 *
 * Present on {@link ResultEvent.usage}. Includes prompt caching and
 * web search metrics when applicable.
 */
export interface TokenUsage {
  /** Total input tokens (including cache reads). */
  inputTokens: number;
  /** Total output tokens generated. */
  outputTokens: number;
  /** Tokens read from the prompt cache. */
  cacheReadTokens?: number;
  /** Tokens written to the prompt cache. */
  cacheWriteTokens?: number;
  /** Tokens written to the 1-hour ephemeral cache. */
  ephemeral1hCacheTokens?: number;
  /** Tokens written to the 5-minute ephemeral cache. */
  ephemeral5mCacheTokens?: number;
  /** Number of web search requests made. */
  webSearchRequests?: number;
  /** Number of web fetch requests made. */
  webFetchRequests?: number;
  /** API service tier used. */
  serviceTier?: string;
}

/**
 * Per-model usage breakdown, keyed by model ID in {@link ResultEvent.modelUsage}.
 *
 * Useful when sub-agents use different models — each model's cost and tokens
 * are tracked separately.
 */
export interface ModelUsageEntry {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  webSearchRequests?: number;
  /** Cost in USD for this model's usage. */
  costUsd: number;
  /** Context window size for this model. */
  contextWindow?: number;
  /** Maximum output tokens for this model. */
  maxOutputTokens?: number;
}

/**
 * Final event — session result, cost, and usage.
 *
 * Always the last event in a query or conversation turn. Check `subtype`
 * to determine success or failure mode.
 *
 * - `'success'` — Normal completion.
 * - `'error_max_turns'` — Hit the `maxTurns` limit.
 * - `'error_during_generation'` — Model error during generation.
 * - `'error_interrupted'` — Session was aborted or interrupted.
 */
export interface ResultEvent {
  type: 'result';
  /** Outcome of the session. */
  subtype: 'success' | 'error_max_turns' | 'error_during_generation' | 'error_interrupted';
  /** Session UUID. */
  sessionId: string;
  /** Final text response from the model. */
  result?: string;
  /** Parsed structured output when `jsonSchema` option was used. */
  structuredOutput?: unknown;
  /** Total wall-clock duration in milliseconds. */
  durationMs?: number;
  /** Number of agentic turns taken. */
  numTurns?: number;
  /** Total cost in USD. */
  costUsd?: number;
  /** Aggregate token usage. */
  usage?: TokenUsage;
  /** Error message (present when `subtype` is not `'success'`). */
  error?: string;
  /** `true` when the result represents an error. */
  isError?: boolean;
  /** Why the model stopped generating (e.g. `'end_turn'`, `'max_tokens'`). */
  stopReason?: string;
  /** Per-model cost and token breakdown (keyed by model ID). */
  modelUsage?: Record<string, ModelUsageEntry>;
  /** Tools that were blocked by the permission system during this session. */
  permissionDenials?: Array<{
    toolName: string;
    toolUseId: string;
    toolInput: unknown;
  }>;
}

// ============================================
// RATE LIMIT EVENT
// ============================================

/**
 * Rate limit status details from the API.
 *
 * Present on {@link RateLimitEvent} — emitted when approaching or hitting
 * Pro/Max subscription rate limits.
 */
export interface RateLimitInfo {
  /** Whether the request was allowed or rate-limited. */
  status: 'allowed' | 'rate_limited' | string;
  /** Epoch seconds when the rate limit window resets. */
  resetsAt: number;
  /** Which rate limit window this applies to. */
  rateLimitType: 'five_hour' | 'seven_day' | string;
  /** Overage billing status, if applicable. */
  overageStatus?: string;
  /** Epoch seconds when overage window resets. */
  overageResetsAt?: number;
  /** Whether the request is using overage billing. */
  isUsingOverage: boolean;
}

/**
 * Rate limit information event — can appear at any point in the stream.
 *
 * Not part of the normal event flow. Check `rateLimitInfo.status` to see
 * if the request was allowed or rate-limited.
 */
export interface RateLimitEvent {
  type: 'rate_limit_event';
  rateLimitInfo: RateLimitInfo;
}

/**
 * Union of all events emitted during a query or conversation turn.
 *
 * **Event order**: `SystemInitEvent` → (`AssistantTextEvent` | `ToolUseEvent` |
 * `ToolResultEvent`)* → `ResultEvent`. A `RateLimitEvent` may appear at any time.
 *
 * Discriminate on `event.type`:
 * - `'system'` → {@link SystemInitEvent}
 * - `'assistant'` → {@link AssistantTextEvent}
 * - `'tool_use'` → {@link ToolUseEvent}
 * - `'tool_result'` → {@link ToolResultEvent}
 * - `'result'` → {@link ResultEvent}
 * - `'rate_limit_event'` → {@link RateLimitEvent}
 */
export type StreamEvent =
  | SystemInitEvent
  | AssistantTextEvent
  | ToolUseEvent
  | ToolResultEvent
  | ResultEvent
  | RateLimitEvent;
