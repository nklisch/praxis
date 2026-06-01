import type { GenerationParams, TokenUsage } from "./common.js";
import type { ConversationTurn } from "./conversation.js";
import type { DebugTraceContext } from "./debug-trace.js";

// ─── Vision Capability ───────────────────────────────────────────────────────

export interface ImageInput {
  /** Image data as base64 (no `data:` prefix). */
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface VisionDescribeRequest {
  prompt: string;
  images: ReadonlyArray<ImageInput>;
  maxTokens?: number;
}

export interface VisionDescribeResponse {
  text: string;
  usage?: TokenUsage;
}

/**
 * Vision capability — extract text/structure from images. Each call opens a
 * fresh underlying SDK session (one-shot). The active tutoring EngineSession's
 * conversation history and prompt cache are NOT affected.
 */
export interface VisionCapability {
  describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse>;
}

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
  /**
   * Cross-engine fallback ONLY: text-splice prior conversation into the
   * first user message. Use when no native resume is possible (engine
   * differs from the one that produced these turns, or a new conversation).
   * For same-engine continuation prefer `resumeEngineSessionId` — it
   * preserves full CLI session state without burning context window.
   */
  priorTurns?: ConversationTurn[];
  /** Per-turn maximum step count (looped engines) or model calls (single-shot). */
  maxSteps?: number;
  generation?: GenerationParams;
  /**
   * Resume the underlying engine's native session by id. When set, the
   * adapter delegates to its SDK's resume primitive (e.g. Claude Code's
   * `--resume`). Adapters that don't support resumption ignore this and
   * fall back to `priorTurns` text-splice. Mutually exclusive with the
   * "fresh start" case — when set, callers should pass empty/no
   * `priorTurns`.
   */
  resumeEngineSessionId?: string;
  /**
   * Fired exactly once when the underlying engine session's id is known
   * (typically when the SDK emits its first `init` event). Used by
   * SessionService to persist the id in `engine_session_state_json` so a
   * later open can pass it as `resumeEngineSessionId`. Adapters that don't
   * have a native session id never fire this.
   */
  onEngineSessionReady?: (engineSessionId: string) => void;
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
   *
   * The optional `signal` allows the caller to abort the in-flight turn.
   * Adapters wire the signal to their underlying SDK's abort mechanism where
   * supported. When the signal fires, the adapter should stop emitting events;
   * `SessionServiceImpl.send` emits a synthetic `{ type: "interrupted" }` event
   * as the final event so consumers and the episodic log know the turn ended
   * early.
   */
  send(
    userMessage: string,
    signal?: AbortSignal,
    trace?: DebugTraceContext,
  ): AsyncIterable<EngineEvent>;

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

  /**
   * Optional vision capability. Phase 5 ships for all three adapters.
   * Each call opens a fresh one-shot SDK session — the active tutoring
   * EngineSession's conversation history and prompt cache are NOT affected.
   */
  readonly vision?: VisionCapability;
}

/**
 * Optional per-call metadata for `ToolRegistry.dispatch`.
 * Engine adapters supply this to thread the engine-side correlation id
 * through to the tool handler via `ToolContext.callId`.
 */
export interface ToolDispatchMeta {
  /** Engine-side correlation id for this tool invocation. */
  callId?: string;
  /**
   * AbortSignal threaded from the active engine turn. Tool handlers can use it
   * directly and pass it into sub-agent sessions.
   */
  signal?: AbortSignal;
  /** Debug trace context for the active engine turn. */
  trace?: DebugTraceContext;
}

export interface ToolRegistry {
  list(): ToolDefinitionSummary[];
  /**
   * Dispatch a tool call by name with optional per-call metadata.
   * `meta.callId` is threaded into `ToolContext.callId` so tool handlers
   * that spawn sub-agents can publish events keyed on the parent's callId.
   */
  dispatch(name: string, args: unknown, meta?: ToolDispatchMeta): Promise<ToolResult>;
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

/**
 * Discriminated origin for `system_note` events.
 * `kind: "assignment_submission"` — fired when a student submits an assignment
 *   that has a `parentSessionId`; carries grade summary for the tutor to narrate.
 * `kind: "system"` — generic runtime notification; `topic` names the domain.
 */
export type SystemNoteOrigin =
  | {
      kind: "assignment_submission";
      assignmentId: string;
      childSessionId: string;
      gradeTotal: number;
      submittedAt: number;
    }
  | { kind: "system"; topic: string };

export type EngineEvent =
  /** Framework-emitted only (never adapter-emitted). Records the user's input in the episodic transcript. */
  | { type: "user_message"; content: string }
  | { type: "model_message"; content: string; partial?: boolean }
  | { type: "tool_call"; toolName: string; args: unknown; callId: string }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "thinking"; content: string }
  | { type: "error"; error: EngineError }
  | {
      type: "final";
      usage: TokenUsage;
      /**
       * How the underlying engine session terminated. When absent, treat as
       * "success". Adapters that surface a richer terminal signal (e.g. the
       * Claude Code CLI's result.subtype) populate this so consumers can
       * distinguish a graceful stop from an engine-side max-turns cut-off
       * without losing the per-turn observability.
       *
       * - "success" — model returned without hitting any limit.
       * - "max_turns" — engine cut the loop short at its own turn cap.
       * - "generation_error" — model error during generation.
       * - "interrupted" — session was aborted or interrupted.
       */
      finalReason?: "success" | "max_turns" | "generation_error" | "interrupted";
      /** Human-readable error string when finalReason !== "success". */
      errorMessage?: string;
    }
  /**
   * Phase 16: a non-user, non-tool, non-model message appended by the runtime.
   * Used for assignment-submission notifications so the teach-mode tutor can
   * narrate per-item feedback. Stored in episodic and surfaced by
   * `loadConversationHistory` as a synthetic user turn prefixed `[Praxis] `.
   */
  | { type: "system_note"; content: string; origin: SystemNoteOrigin }
  /**
   * Framework-emitted when a user-initiated cancel aborts the in-flight turn.
   * Yielded as the final event in the generator; persisted to the episodic log
   * so the transcript reflects that the turn ended early.
   *
   * - "user_cancel" — `AbortSignal` from the client was aborted mid-turn.
   * - "engine_abort" — adapter-level abort without a client-side signal.
   */
  | { type: "interrupted"; reason: "user_cancel" | "engine_abort" };

/**
 * Structured payload for `engine.rate_limited` errors. Mirrors the SDK's
 * RateLimitInfo so a renderer can build a banner (with countdown driven by
 * `resetsAt`) without regex-parsing the message string.
 *
 * `kind: "rate_limit"` discriminates this from any future error-detail
 * variants we add (subscriber-fanout, quota, etc.).
 */
export interface RateLimitErrorDetails {
  kind: "rate_limit";
  /** Window scope. Free-form to tolerate future SDK additions. */
  rateLimitType: "five_hour" | "seven_day" | string;
  /** Epoch seconds when the rate-limit window resets. */
  resetsAt: number;
  /** Whether the request is using overage billing. */
  isUsingOverage: boolean;
  overageStatus?: string;
  /** Epoch seconds when overage window resets. */
  overageResetsAt?: number;
}

export interface EngineError {
  code: string;
  message: string;
  recoverable: boolean;
  cause?: unknown;
  /**
   * Optional structured payload. Present for errors whose code has a
   * declared `*ErrorDetails` shape. Renderers should switch on
   * `details?.kind` and fall back to `message` when absent.
   */
  details?: RateLimitErrorDetails;
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
