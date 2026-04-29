import type { GenerationParams, TokenUsage } from "./common.js";
import type { ConversationTurn } from "./conversation.js";

/**
 * Options for opening a multi-turn engine session. The systemPrompt and tools
 * are fixed for the lifetime of the session. priorTurns seeds the session
 * when continuing an existing conversation (engine swap, process restart);
 * adapters use them to bootstrap their internal state. On the first turn of
 * a brand new conversation, priorTurns is undefined or empty.
 */
export interface EngineOpenOptions {
  systemPrompt: string;
  tools: ToolRegistry;
  /** When set, the session is being re-opened with prior context to restore. */
  priorTurns?: ConversationTurn[];
  /** Per-turn maximum step count (looped engines) or model calls (single-shot). */
  maxSteps?: number;
  generation?: GenerationParams;
}

/**
 * A multi-turn engine session. Adapters wrap their SDK's native conversation
 * primitive (Conversation for Claude Code, Thread for Codex) or hold an
 * in-memory messages array (Direct). The framework holds one EngineSession
 * per Praxis session and calls `.send()` per user turn.
 */
export interface EngineSession {
  /**
   * Stable session identifier for diagnostics. May match the SDK's native
   * session id (e.g., Claude Code's sessionId, Codex's thread id) when
   * applicable, or be a synthesized UUID for adapters without native ids.
   */
  readonly id: string;

  /**
   * Send one user message; yield engine events; resolves when the engine's
   * internal loop completes for this turn. Subsequent calls continue the same
   * conversation — the adapter's underlying SDK preserves history natively
   * (Claude Code, Codex) or via an in-memory messages array (Direct).
   */
  send(userMessage: string): AsyncIterable<EngineEvent>;

  /**
   * Tear down the underlying SDK session, MCP bridge subprocess, etc.
   * Idempotent. Called by the framework when ending a Praxis session OR
   * when swapping engines mid-session.
   */
  close(): Promise<void>;
}

export interface Engine {
  /** Identifier for diagnostics and selection. e.g. "claude-code", "codex", "direct.anthropic". */
  readonly id: string;

  /**
   * Engine category. Affects how the framework constrains options.
   * - "looped": engine runs its own internal loop until done per `send`.
   * - "single-shot": engine answers per model call; framework orchestrates the loop within `send`.
   */
  readonly kind: "looped" | "single-shot";

  /**
   * Open a multi-turn session. Async because adapters may need to spawn
   * subprocesses (MCP tool bridge), open SDK conversations, or perform other
   * setup that can fail. Throws on failure — the caller (SessionServiceImpl)
   * surfaces the error to the user before any send is attempted.
   */
  open(opts: EngineOpenOptions): Promise<EngineSession>;

  /** Health check / capability probe. Used at session start. */
  health(): Promise<HealthStatus>;
}

export interface ToolRegistry {
  list(): ToolDefinitionSummary[];
  dispatch(name: string, args: unknown): Promise<ToolResult>;
}

export interface ToolDefinitionSummary {
  name: string;
  description: string;
  inputSchemaJson: unknown; // JSON Schema serialization (always present)
  /**
   * Optional native input schema in the implementation's preferred form.
   * For InProcessToolRegistry this is the original `z.ZodType<unknown>` instance.
   * Engine adapters that need typed schemas (Claude Code SDK MCP, etc.) consume
   * this when present and fall back to JSON-Schema-to-Zod conversion otherwise.
   */
  inputSchemaNative?: unknown;
  tier: "deterministic" | "grounded" | "model-derived";
}

export type ToolResult =
  | { ok: true; value: unknown; tier: "deterministic" | "grounded" | "model-derived" }
  | { ok: false; error: { code: string; message: string; recoverable: boolean } };

export type EngineEvent =
  /** Framework-emitted only (never adapter-emitted). Records the user's input in the episodic transcript. */
  | { type: "user_message"; content: string }
  | { type: "model_message"; content: string; partial?: boolean }
  | { type: "tool_call"; toolName: string; args: unknown; callId: string }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "thinking"; content: string }
  | { type: "error"; error: EngineError }
  | { type: "final"; usage: TokenUsage };

export interface EngineError {
  code: string;
  message: string;
  recoverable: boolean;
  cause?: unknown;
}

export interface HealthStatus {
  ok: boolean;
  detail?: string;
  capabilities: {
    vision: boolean;
    streaming: boolean;
    nativeMCP: boolean;
    contextWindow: number;
  };
}

/**
 * Construct an EngineError with sensible defaults. `recoverable` defaults to
 * false (most engine errors aren't); `cause` is omitted from the object when
 * undefined (compatible with exactOptionalPropertyTypes).
 */
export function engineError(
  code: string,
  message: string,
  opts?: { recoverable?: boolean; cause?: unknown },
): EngineError {
  return {
    code,
    message,
    recoverable: opts?.recoverable ?? false,
    ...(opts?.cause !== undefined && { cause: opts.cause }),
  };
}

// Retained for backward-compat with curriculum-internal Brief composition (curriculum-local type).
// DO NOT add new cross-package usages — engines now accept EngineOpenOptions.
export interface BriefContext {
  retrievedChunks: RetrievedChunk[];
  studentSummary?: string; // model-readable summary derived from semantic memory
  artifactRefs: string[]; // serialized references to artifacts in scope
}

export interface RetrievedChunk {
  documentId: string;
  text: string;
  locator: { page?: number; section?: string };
  score: number;
}
