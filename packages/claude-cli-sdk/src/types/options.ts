import type { McpServerConfig } from "./mcp.js";
import type { ToolDefinition, ToolHandler } from "./tools.js";

// ============================================
// UUID (branded type for session IDs)
// ============================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Branded string type for UUID session identifiers.
 *
 * Create with {@link uuid}. Used by {@link OptionsBase.sessionId} to set a
 * deterministic session ID that can later be passed to
 * {@link ConversationOptions.resume} for session continuity.
 */
export type UUID = string & { readonly __brand: "UUID" };

/**
 * Validate and brand a string as a {@link UUID}.
 *
 * @param value - A UUID v4 string (e.g. `"550e8400-e29b-41d4-a716-446655440000"`).
 * @returns The same string, branded as `UUID`.
 * @throws {TypeError} If the value does not match the UUID format.
 *
 * @example
 * import { uuid } from '@praxis/claude-cli-sdk';
 * const id = uuid('550e8400-e29b-41d4-a716-446655440000');
 * const conv = createConversation({ sessionId: id });
 */
export function uuid(value: string): UUID {
  if (!UUID_RE.test(value)) {
    throw new TypeError(`Invalid UUID: ${JSON.stringify(value)}`);
  }
  return value as UUID;
}

/**
 * Check whether a string is a valid UUID without throwing.
 *
 * @param value - The string to test.
 * @returns `true` if valid (also narrows the type to {@link UUID}).
 *
 * @example
 * if (isUUID(input)) {
 *   const conv = createConversation({ sessionId: input });
 * }
 */
export function isUUID(value: string): value is UUID {
  return UUID_RE.test(value);
}

// ============================================
// PERMISSION MODE
// ============================================

/**
 * Permission mode controlling how the CLI handles tool permission prompts.
 *
 * - `'default'` — Prompt the user for each tool call (interactive).
 * - `'acceptEdits'` — Auto-approve file edits, prompt for everything else.
 * - `'bypassPermissions'` — Skip all permission prompts (same as `dangerouslySkipPermissions`).
 * - `'dontAsk'` — Deny any tool that would require a prompt.
 * - `'plan'` — Plan mode: read-only tools only, no writes.
 * - `'auto'` — Automatically approve all tool calls (requires trust).
 */
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "dontAsk"
  | "plan"
  | "auto";

// ============================================
// TOOL CONTROL
// ============================================

/**
 * Fine-grained tool visibility control for allowlist/blocklist/custom tools.
 *
 * Use `only` OR `deny` (mutually exclusive). Add `custom` to inject your own
 * tools via an ephemeral MCP server (conversations only).
 */
export interface ToolFilter {
  /**
   * Whitelist: ONLY these tools (plus ToolSearch) can be called.
   * All others become invisible to the model.
   * Requires a discovery pass (~2-3s) to enumerate available tools.
   * Mutually exclusive with `deny`.
   */
  only?: string[];
  /**
   * Blocklist: these tools become invisible to the model.
   * Mutually exclusive with `only`.
   */
  deny?: string[];
  /**
   * Custom tools to inject into the session via an ephemeral MCP server.
   * The SDK handles MCP server lifecycle automatically.
   * Tool names appear as `mcp__sdk__<name>` in the session.
   *
   * Requires `@modelcontextprotocol/sdk` to be installed.
   * Only works with `createConversation()`, not `query()`.
   */
  custom?: ToolDefinition[];
}

/**
 * Tool visibility control.
 *
 * - `'all'`  — all tools available (default behavior, same as omitting)
 * - `'none'` — no tools available (pure text generation, no agentic behavior)
 * - `{ only: [...] }` — whitelist: only these tools visible
 * - `{ deny: [...] }` — blocklist: these tools hidden
 */
export type ToolControl = "all" | "none" | ToolFilter;

// ============================================
// AGENT DEFINITION
// ============================================

/**
 * Definition for a named sub-agent in multi-agent orchestration.
 *
 * Pass a record of these via {@link OptionsBase.agents}. The main agent can
 * then delegate work using the `Agent` tool with the agent's name.
 *
 * @example
 * query('Build the app', {
 *   agents: {
 *     researcher: {
 *       description: 'Searches codebase for context',
 *       prompt: 'You are a code research assistant.',
 *       allowedTools: ['Read', 'Grep', 'Glob'],
 *       maxTurns: 5,
 *     },
 *   },
 * });
 */
export interface AgentDefinition {
  /** Short description shown when the main agent lists available sub-agents. */
  description?: string;
  /** System prompt for the sub-agent. */
  prompt?: string;
  /** Model alias for this sub-agent. */
  model?: ModelAlias;
  /** Maximum agentic turns for this sub-agent. */
  maxTurns?: number;
  /** Allowlist of tools this sub-agent can use. */
  allowedTools?: string[];
  /** Effort level override for this agent. Added in CLI v2.1.78. */
  effort?: "low" | "medium" | "high";
  /** Tools to deny for this agent. Added in CLI v2.1.78. */
  disallowedTools?: string[];
}

// ============================================
// OUTPUT FORMAT
// ============================================

/**
 * JSON Schema output format passed to the CLI via `--json-schema`.
 *
 * Create from a Zod schema with {@link zodToOutputFormat} instead of
 * building manually. The CLI constrains model output to match this schema.
 */
export interface JsonSchemaOutputFormat {
  type: "json_schema";
  /** The JSON Schema object (must not contain `$schema` key — the CLI rejects it). */
  schema: Record<string, unknown>;
  /** Schema name shown to the model (default: `'Output'`). */
  name?: string;
  /** Enable strict schema enforcement (default: `true`). */
  strict?: boolean;
}

// ============================================
// QUERY OPTIONS
// ============================================

/**
 * Model alias — the CLI resolves these to the latest model version automatically.
 *
 * - `'haiku'` — Fastest, cheapest. Good for simple tasks.
 * - `'sonnet'` — Balanced speed and capability. Default if omitted.
 * - `'opus'` — Most capable. Best for complex reasoning.
 */
export type ModelAlias = "haiku" | "sonnet" | "opus";

/**
 * Base options shared by {@link Options} (one-shot queries) and
 * {@link ConversationOptions} (multi-turn conversations).
 *
 * These control model selection, tool visibility, structured output,
 * MCP servers, session identity, and runtime behavior.
 */
export interface OptionsBase {
  // --- Model ---
  /** Model alias (e.g., 'haiku', 'sonnet', 'opus'). The CLI resolves to the latest version. */
  model?: ModelAlias;
  /** Effort level: 'low' | 'medium' | 'high' */
  effort?: "low" | "medium" | "high";
  /** Fallback model if primary fails */
  fallbackModel?: ModelAlias;

  // --- Tool control ---
  /**
   * Control which tools are visible to the model.
   *
   * - Omit or `'all'` — all tools available (default)
   * - `'none'` — disable all tools (pure text generation)
   * - `{ only: ['Read', 'Bash'] }` — whitelist (requires discovery pass ~2-3s)
   * - `{ deny: ['Write'] }` — blocklist
   *
   * Use `toolPattern.mcp('server', 'tool')` for MCP tool names.
   *
   * @example
   * // Only allow reading:
   * query('...', { tools: { only: ['Read', 'Glob', 'Grep'] } })
   *
   * // Block writes:
   * query('...', { tools: { deny: ['Write', 'Edit', 'Bash'] } })
   *
   * // No tools at all (text-only):
   * query('...', { tools: 'none' })
   */
  tools?: ToolControl;

  // --- Structured output ---
  /** JSON Schema for structured output. Use zodToOutputFormat() to create from Zod. */
  jsonSchema?: JsonSchemaOutputFormat;

  // --- Turns and budget ---
  /** Max agentic turns before stopping */
  maxTurns?: number;
  /** Max spend in USD before stopping */
  maxBudgetUsd?: number;

  // --- MCP ---
  /** MCP server configurations */
  mcpServers?: Record<string, McpServerConfig>;
  /** Additional MCP config file paths to load (merged with mcpServers). Maps to --mcp-config. */
  mcpConfigFiles?: string[];

  // --- Sub-agents ---
  /** Agent definitions for multi-agent orchestration, keyed by agent name */
  agents?: Record<string, AgentDefinition>;
  /** Name of agent to invoke */
  agent?: string;

  // --- Additional context ---
  /** Additional directories to include in context */
  additionalDirectories?: string[];
  /** Working directory for the CLI process */
  workDir?: string;

  // --- Extension loading ---
  /** Path(s) to plugin directories to load. Maps to --plugin-dir. */
  pluginDirs?: string[];
  /** Settings file path or inline JSON string. Maps to --settings. Can contain hooks. */
  settings?: string;
  /** Disable all skills/slash commands. Maps to --disable-slash-commands. */
  disableSlashCommands?: boolean;
  /** Only use MCP servers from mcpServers option. Maps to --strict-mcp-config. */
  strictMcpConfig?: boolean;

  // --- Session identity ---
  /** Display name for the session (shown in /resume list). Maps to --name. */
  name?: string;
  /** Use a specific UUID for the session. Maps to --session-id. Create with `uuid()`. */
  sessionId?: UUID;
  /** Don't save session to disk; cannot be resumed. Maps to --no-session-persistence. */
  noSessionPersistence?: boolean;

  // --- Performance ---
  /**
   * Minimal mode: skip hooks, LSP, plugin sync, auto-memory, CLAUDE.md discovery.
   * Reduces startup time for CI/scripted use. Maps to --bare.
   *
   * **Note:** `--bare` skips local auth file discovery. You must provide
   * authentication via environment variables (e.g. `ANTHROPIC_API_KEY` in `env`).
   */
  bare?: boolean;

  // --- Misc flags ---
  /** Enable SendUserMessage tool for agent-to-user communication. Maps to --brief. */
  brief?: boolean;
  /** Enable beta features */
  betas?: string[];
  /** Setting sources override */
  settingSources?: string[];
  /** Include partial messages in stream */
  includePartialMessages?: boolean;
  /** Re-emit user messages on stdout for acknowledgment (stream-json mode). Maps to --replay-user-messages. */
  replayUserMessages?: boolean;

  // --- Runtime ---
  /** Timeout in ms (default: 300000) */
  timeout?: number;
  /** Abort signal */
  abortController?: AbortController;
  /** Additional environment variables */
  env?: Record<string, string>;
}

// ---- Session control: resume, continue, forkSession ----
// forkSession is only valid alongside resume or continue.
type SessionOptions =
  | { resume: string; continue?: never; forkSession?: boolean }
  | { resume?: never; continue: true; forkSession?: boolean }
  | { resume?: never; continue?: never; forkSession?: never };

// ---- Permission: permissionMode XOR dangerouslySkipPermissions ----
type PermissionOptions =
  | { permissionMode: PermissionMode; dangerouslySkipPermissions?: never }
  | { permissionMode?: never; dangerouslySkipPermissions: true }
  | { permissionMode?: never; dangerouslySkipPermissions?: never };

// ---- System prompt: systemPrompt XOR appendSystemPrompt (inline or file, not both) ----
type SystemPromptOptions =
  | {
      systemPrompt: string;
      systemPromptFile?: never;
      appendSystemPrompt?: never;
      appendSystemPromptFile?: never;
    }
  | {
      systemPrompt?: never;
      systemPromptFile: string;
      appendSystemPrompt?: never;
      appendSystemPromptFile?: never;
    }
  | {
      systemPrompt?: never;
      systemPromptFile?: never;
      appendSystemPrompt: string;
      appendSystemPromptFile?: never;
    }
  | {
      systemPrompt?: never;
      systemPromptFile?: never;
      appendSystemPrompt?: never;
      appendSystemPromptFile: string;
    }
  | {
      systemPrompt?: never;
      systemPromptFile?: never;
      appendSystemPrompt?: never;
      appendSystemPromptFile?: never;
    };

/**
 * Options for {@link query} — one-shot streaming queries.
 *
 * Extends {@link OptionsBase} with mutually exclusive groups:
 * - **Session**: `resume` XOR `continue` (with optional `forkSession`), or neither.
 * - **Permission**: `permissionMode` XOR `dangerouslySkipPermissions`, or neither.
 * - **System prompt**: At most one of `systemPrompt`, `systemPromptFile`,
 *   `appendSystemPrompt`, `appendSystemPromptFile`.
 *
 * @example
 * // Minimal usage:
 * query('Hello', { maxTurns: 1 })
 *
 * // With structured output:
 * query('Extract entities', { jsonSchema: zodToOutputFormat(mySchema), maxTurns: 3 })
 *
 * // Resume a previous session:
 * query('Continue', { resume: sessionId })
 */
export type Options = OptionsBase & SessionOptions & PermissionOptions & SystemPromptOptions;

// ============================================
// CONVERSATION OPTIONS (Unit 1)
// ============================================

/**
 * Options for {@link createConversation} — persistent multi-turn sessions.
 *
 * Same as {@link OptionsBase} minus `fallbackModel`, plus conversation-specific
 * fields: `resume`, `toolHandlers`, and system prompt options.
 *
 * The CLI process is spawned lazily on the first `send()` or `sendAndCollect()`.
 *
 * @example
 * createConversation({
 *   model: 'sonnet',
 *   maxTurns: 10,
 *   dangerouslySkipPermissions: true,
 *   toolHandlers: {
 *     AskUserQuestion: askUserQuestionHandler(q => rl.question(q)),
 *   },
 * })
 */
export type ConversationOptions = Omit<OptionsBase, "fallbackModel"> & {
  permissionMode?: PermissionMode;
  dangerouslySkipPermissions?: boolean;
  systemPrompt?: string;
  /** Path to a file containing the system prompt. Mutually exclusive with systemPrompt. */
  systemPromptFile?: string;
  appendSystemPrompt?: string;
  /** Path to a file containing the append system prompt. Mutually exclusive with appendSystemPrompt. */
  appendSystemPromptFile?: string;
  /**
   * Resume a previous session by ID. The conversation will have full
   * prior context. Combine with `sessionId` on the original session
   * for deterministic IDs.
   *
   * @example
   * // Create with known ID:
   * const conv = createConversation({ sessionId: 'my-id', ... });
   * await conv.sendAndCollect('start work');
   * await conv.close();
   *
   * // Later, resume:
   * const conv2 = createConversation({ resume: 'my-id', ... });
   * await conv2.sendAndCollect('continue');
   */
  resume?: string;
  /**
   * Handlers for intercepted tool calls. When `sendAndCollect` sees a `tool_use` event
   * whose name matches a key here, it calls the handler and sends the result back to
   * Claude automatically, looping until the final result arrives.
   *
   * @example
   * createConversation({
   *   toolHandlers: {
   *     MyTool: async (event) => ({ value: 'result' }),
   *   },
   * });
   */
  toolHandlers?: Record<string, ToolHandler>;
  /**
   * Called once when the CLI emits its `init` event with the real session ID.
   * Fires inside the first turn — before any user-visible events flow. Use
   * this to wire the real session id into your logger bindings without
   * having to await `conversation.sessionId` (which would deadlock at open
   * time, before any send).
   */
  onSessionReady?: (sessionId: string) => void;
};
