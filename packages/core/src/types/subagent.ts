import type { SessionId, Timestamp } from "./index.js";

/**
 * One active or recently-finished sub-agent run tracked by `SubAgentRegistry`.
 * Keyed by `parentCallId` — the tool_call.callId from the parent session that
 * spawned this sub-agent. The UI uses this as its subscription key.
 */
export interface SubAgentItem {
  /** Same value as the parent session's tool_call.callId — the UI keys on this. */
  parentCallId: string;
  sessionId: SessionId;
  /** Verb-in-italic phrase, e.g., "reading your materials". */
  label: string;
  status: "running" | "done" | "failed" | "interrupted";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  errorMessage?: string;
  /** Ordered list of step records observed so far. Newest last. */
  steps: SubAgentStep[];
}

/**
 * One tool call observed inside the sub-agent's isolated session.
 * `callId` here is the sub-agent's internal call id (NOT the parent's).
 */
export interface SubAgentStep {
  /** Sub-agent's internal callId (NOT the parent's). */
  callId: string;
  toolName: string;
  /** Human label resolved from getToolLabel(toolName).present. */
  label: string;
  /** Set when the matching tool_result arrives. */
  ok?: boolean;
  startedAt: Timestamp;
  endedAt?: Timestamp;
}

/**
 * Discriminated event stream from `SubAgentRegistry` to renderers.
 * Uses `kind` (not `type`) because these are stored/transmitted domain events,
 * not engine-stream events. `snapshot` is sent immediately on subscribe so the
 * renderer sees current state without waiting for the next change.
 */
export type SubAgentEvent =
  | { kind: "snapshot"; items: readonly SubAgentItem[] }
  | { kind: "started"; item: SubAgentItem }
  | { kind: "step_started"; parentCallId: string; step: SubAgentStep }
  | { kind: "step_settled"; parentCallId: string; callId: string; ok: boolean }
  | { kind: "phase_changed"; parentCallId: string; label: string }
  | {
      kind: "finished";
      parentCallId: string;
      status: "done" | "failed" | "interrupted";
      errorMessage?: string;
    };

export interface SubAgentStartInput {
  parentCallId: string;
  sessionId: SessionId;
  /** Initial verb-in-italic label, e.g., "reading your materials". */
  label: string;
}

/**
 * Handle returned by `SubAgentRegistry.start()`. Producers hold this and emit
 * step-by-step events as the sub-agent runs.
 */
export interface SubAgentHandle {
  readonly parentCallId: string;
  /** Emit a step_started event when the sub-agent calls a tool. */
  stepStarted(input: { callId: string; toolName: string }): void;
  /** Emit a step_settled event when the sub-agent's tool_result arrives. */
  stepSettled(input: { callId: string; ok: boolean }): void;
  /** Emit a phase_changed event when the sub-agent transitions to a new phase. */
  setLabel(label: string): void;
  /** Emit a finished event; item lingers ~30s before auto-removal. */
  finish(status: "done" | "failed" | "interrupted", err?: { message: string }): void;
}

export type SubAgentListener = (event: SubAgentEvent) => void;

/**
 * Server-side registry for sub-agent transparency events.
 * Mirrors `ActivityRegistry` but keyed by `parentCallId` (caller-supplied),
 * surfaces immediately (no quiet-period), and lingers ~30s after finish.
 */
export interface SubAgentRegistry {
  /** Start tracking a new sub-agent run. Returns a handle for emitting events. */
  start(input: SubAgentStartInput): SubAgentHandle;
  /** Snapshot of all currently-visible items. */
  list(): readonly SubAgentItem[];
  /**
   * Subscribe to events. The listener receives a `snapshot` immediately.
   * Optional `filter.parentCallId` constrains delivery to one item.
   * Returns an unsubscribe function.
   */
  subscribe(listener: SubAgentListener, filter?: { parentCallId?: string }): () => void;
  /**
   * Mark all in-flight sub-agent items for the given parent session as
   * `interrupted`. Called by `SessionServiceImpl.send` when the parent turn's
   * AbortSignal fires so the UI transitions items immediately without waiting
   * for the sub-agent to drain naturally.
   *
   * Items whose `sessionId` matches `parentSessionId` and whose `status` is
   * `"running"` transition to `"interrupted"` and emit a `"finished"` terminal
   * event to listeners. Items already in a terminal status are skipped (no-op).
   */
  interruptAllForSession(parentSessionId: SessionId): void;
}
