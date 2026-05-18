/**
 * QuickCheckServiceImpl — in-process human-in-the-loop dispatch for Phase 17.
 *
 * Maintains an in-memory map of pending quick checks keyed by callId. Tool
 * handlers block on `await(...)` until the renderer resolves via IPC or the
 * call is cancelled/timed-out.
 *
 * Subscriber notifications mirror ActivityRegistryImpl's EventEmitter pattern.
 */
import type { AssignmentItem } from "../types/artifacts.js";
import type { Logger } from "../types/common.js";
import type { SessionId } from "../types/ids.js";
import type {
  QuickCheckAnswer,
  QuickCheckEvent,
  QuickCheckListener,
  QuickCheckService,
} from "../types/quick-check.js";
import { notifyListeners } from "./db-helpers.js";

const NOOP_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => NOOP_LOGGER,
};

interface PendingEntry {
  resolve: (answer: QuickCheckAnswer) => void;
  sessionId: SessionId;
  item: AssignmentItem;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

export class QuickCheckServiceImpl implements QuickCheckService {
  private readonly pending = new Map<string, PendingEntry>();
  private readonly listeners = new Set<QuickCheckListener>();
  private readonly log: Logger;

  constructor(log?: Logger) {
    this.log = log ?? NOOP_LOGGER;
  }

  await(input: {
    callId: string;
    sessionId: SessionId;
    item: AssignmentItem;
    timeoutMs?: number;
  }): Promise<QuickCheckAnswer> {
    const { callId, sessionId, item, timeoutMs } = input;

    return new Promise<QuickCheckAnswer>((promiseResolve) => {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      if (timeoutMs !== undefined && timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          if (this.pending.has(callId)) {
            this.pending.delete(callId);
            const abandoned: QuickCheckAnswer = { kind: "abandoned" };
            this.emit({ kind: "resolved", callId, answer: abandoned });
            promiseResolve(abandoned);
          }
        }, timeoutMs);
      }

      this.pending.set(callId, {
        resolve: promiseResolve,
        sessionId,
        item,
        ...(timeoutHandle !== undefined && { timeoutHandle }),
      });

      // Emit pending event AFTER registering, so subscribers see it.
      this.emit({ kind: "pending", callId, sessionId, item });
    });
  }

  resolve(input: { callId: string; answer: QuickCheckAnswer }): void {
    const { callId, answer } = input;
    const entry = this.pending.get(callId);
    if (!entry) return; // no-op: unknown callId

    this.pending.delete(callId);
    if (entry.timeoutHandle !== undefined) {
      clearTimeout(entry.timeoutHandle);
    }
    this.emit({ kind: "resolved", callId, answer });
    entry.resolve(answer);
  }

  cancel(callId: string): void {
    this.resolve({ callId, answer: { kind: "abandoned" } });
  }

  subscribe(listener: QuickCheckListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private emit(event: QuickCheckEvent): void {
    notifyListeners(this.listeners, event, this.log, "quick-check-service");
  }
}
