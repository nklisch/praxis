/**
 * Phase 17: QuickCheckService types.
 *
 * QuickChecks are ephemeral inline questions the tutor model poses to the
 * student during a teach session. They block the tool call until the student
 * answers (or the call is abandoned). They are NOT persisted to assignments.
 */
import type { AssignmentItem } from "./artifacts.js";
import type { SessionId } from "./ids.js";

/**
 * Possible answers a student can give to a quick check. The `kind` field
 * matches the item kind for choice-based items; `abandoned` is a special
 * sentinel when the student dismisses or the call times out.
 */
export type QuickCheckAnswer =
  | { kind: "single-choice"; selectedIndex: number }
  | { kind: "multi-select"; selectedIndices: number[] }
  | { kind: "short-answer"; text: string }
  | { kind: "matching"; pairs: Array<{ leftId: string; rightId: string }> }
  | { kind: "confidence"; rating: number }
  | {
      kind: "structured-question";
      /**
       * One entry per question in the card, keyed by questionIndex.
       * `selectedIndices` handles both single- and multi-select:
       *  - single-select: exactly one element
       *  - multi-select: zero or more elements
       */
      answers: Array<{ questionIndex: number; selectedIndices: number[] }>;
    }
  | { kind: "abandoned" };

/**
 * Events emitted by QuickCheckService to renderer subscribers.
 *
 * - `pending`: a tool handler is waiting for student input; the renderer should
 *   render a <QuickCheckCard> for this callId.
 * - `resolved`: the student answered (or the call was abandoned); the renderer
 *   should lock the card.
 */
export type QuickCheckEvent =
  | { kind: "pending"; callId: string; sessionId: SessionId; item: AssignmentItem }
  | { kind: "resolved"; callId: string; answer: QuickCheckAnswer };

/** Listener signature. Returns void so the service doesn't need to await it. */
export type QuickCheckListener = (event: QuickCheckEvent) => void;

/**
 * QuickCheckService — in-process human-in-the-loop dispatch.
 *
 * Tool handlers call `await(...)` to pend a quick check; the IPC layer
 * forwards `pending` events to the renderer; the renderer calls `resolve(...)`
 * via IPC when the student submits; the tool handler's Promise resolves.
 */
export interface QuickCheckService {
  /**
   * Register a pending quick check; emit a `pending` event; return a Promise
   * that resolves when `resolve()` or `cancel()` is called for this callId.
   *
   * If `timeoutMs` is set, the Promise resolves with `{ kind: "abandoned" }`
   * after that many milliseconds unless already resolved.
   */
  await(input: {
    callId: string;
    sessionId: SessionId;
    item: AssignmentItem;
    timeoutMs?: number;
  }): Promise<QuickCheckAnswer>;

  /**
   * Resolve a pending quick check. Called by the IPC handler when the
   * student submits an answer. No-op if `callId` is unknown.
   */
  resolve(input: { callId: string; answer: QuickCheckAnswer }): void;

  /**
   * Cancel a pending quick check — resolves the awaiting handler with
   * `{ kind: "abandoned" }`. No-op if `callId` is unknown.
   */
  cancel(callId: string): void;

  /** Subscribe to pending/resolved events. Returns an unsubscribe function. */
  subscribe(listener: QuickCheckListener): () => void;
}
