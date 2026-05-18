import { v7 as uuidv7 } from "uuid";
import type {
  ActivityEvent,
  ActivityHandle,
  ActivityItem,
  ActivityListener,
  ActivityRegistry,
  ActivityStartInput,
  ActivityUpdatePatch,
  Logger,
  Timestamp,
} from "../types/index.js";
import { notifyListeners } from "./db-helpers.js";

const DEFAULT_LINGER_MS = 4_000;
const DEFAULT_FAILED_LINGER_MS = 10_000;

export interface ActivityRegistryDeps {
  log: Logger;
  /** Wall-clock now provider (testable seam). */
  now?: () => number;
  /** setTimeout-shaped scheduler (testable seam). */
  setTimeout?: typeof globalThis.setTimeout;
  /** clearTimeout-shaped (testable seam). */
  clearTimeout?: typeof globalThis.clearTimeout;
}

export class ActivityRegistryImpl implements ActivityRegistry {
  private readonly items = new Map<string, ActivityItem>();
  private readonly listeners = new Set<ActivityListener>();
  /** Items in `running` whose `quietPeriodMs` has not yet elapsed. Hidden from emitters. */
  private readonly hidden = new Set<string>();
  /** Pending timers for quiet-period reveal + linger removal, by item id. */
  private readonly timers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();

  private readonly now: () => number;
  private readonly setTimer: typeof globalThis.setTimeout;
  private readonly clearTimer: typeof globalThis.clearTimeout;

  constructor(private readonly deps: ActivityRegistryDeps) {
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimeout ?? globalThis.setTimeout;
    this.clearTimer = deps.clearTimeout ?? globalThis.clearTimeout;
  }

  start(input: ActivityStartInput): ActivityHandle {
    const id = input.id ?? uuidv7();
    if (this.items.has(id)) {
      // Stable-id collision — treat as a no-op update of label / detail.
      // Producers occasionally re-call start with the same id during
      // retries; clobbering the existing item would lose history.
      this.deps.log.debug("activity.start.collision", { id });
      this.updateItem(id, {
        label: input.label,
        ...(input.detail !== undefined && { detail: input.detail }),
        ...(input.progress !== undefined && { progress: input.progress }),
      });
      return this.makeHandle(id);
    }

    const startedAt = this.now() as Timestamp;
    const item: ActivityItem = {
      id,
      label: input.label,
      ...(input.detail !== undefined && { detail: input.detail }),
      ...(input.progress !== undefined && { progress: input.progress }),
      status: "running",
      startedAt,
      ...(input.quietPeriodMs !== undefined && { quietPeriodMs: input.quietPeriodMs }),
      ...(input.lingerMs !== undefined && { lingerMs: input.lingerMs }),
      ...(input.failedLingerMs !== undefined && { failedLingerMs: input.failedLingerMs }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
    };
    this.items.set(id, item);

    if (input.quietPeriodMs !== undefined && input.quietPeriodMs > 0) {
      this.hidden.add(id);
      const t = this.setTimer(() => {
        this.timers.delete(id);
        if (this.hidden.delete(id)) {
          // Reveal — emit `added` only now.
          const cur = this.items.get(id);
          if (cur) this.emit({ kind: "added", item: cur });
        }
      }, input.quietPeriodMs);
      // biome-ignore lint/suspicious/noExplicitAny: NodeJS.Timeout has unref; browser timers don't
      (t as any).unref?.();
      this.timers.set(id, t);
    } else {
      this.emit({ kind: "added", item });
    }

    return this.makeHandle(id);
  }

  list(): readonly ActivityItem[] {
    const out: ActivityItem[] = [];
    for (const [id, item] of this.items) {
      if (this.hidden.has(id)) continue;
      out.push(item);
    }
    return out;
  }

  subscribe(listener: ActivityListener): () => void {
    listener({ kind: "snapshot", items: this.list() });
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dismiss(id: string): void {
    const item = this.items.get(id);
    if (!item || item.status === "running") return;
    this.removeNow(id);
  }

  shutdown(): void {
    // Mark all running items as failed with a generic reason. Emit the
    // updates so the renderer (if still connected) sees the transition,
    // then clear and stop emitting. The actual cancellation of producer
    // work happens elsewhere — the registry just clears its display.
    for (const [id, item] of this.items) {
      if (item.status === "running") {
        const next: ActivityItem = {
          ...item,
          status: "failed",
          endedAt: this.now() as Timestamp,
          errorMessage: "shut down",
        };
        this.items.set(id, next);
        if (!this.hidden.has(id)) this.emit({ kind: "updated", item: next });
      }
    }
    for (const t of this.timers.values()) this.clearTimer(t);
    this.timers.clear();
    this.hidden.clear();
    this.items.clear();
    // Final snapshot so subscribers know the rail is empty.
    this.emit({ kind: "snapshot", items: [] });
    // After this, listeners may still exist but won't receive further events
    // (no producer can reach us — buildServices will discard the registry).
    this.listeners.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private makeHandle(id: string): ActivityHandle {
    return {
      id,
      update: (patch) => this.updateItem(id, patch),
      finish: (status, err) => this.finish(id, status, err),
    };
  }

  private updateItem(id: string, patch: ActivityUpdatePatch): void {
    const cur = this.items.get(id);
    if (!cur || cur.status !== "running") return;
    const next: ActivityItem = {
      ...cur,
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.detail !== undefined && { detail: patch.detail }),
      ...(patch.progress !== undefined && { progress: patch.progress }),
    };
    this.items.set(id, next);
    if (!this.hidden.has(id)) this.emit({ kind: "updated", item: next });
  }

  private finish(id: string, status: "done" | "failed", err?: { message: string }): void {
    const cur = this.items.get(id);
    if (!cur || cur.status !== "running") return;

    if (this.hidden.has(id)) {
      // Finished before quietPeriod expired — never visible. Just drop.
      this.hidden.delete(id);
      const t = this.timers.get(id);
      if (t) {
        this.clearTimer(t);
        this.timers.delete(id);
      }
      this.items.delete(id);
      return;
    }

    const endedAt = this.now() as Timestamp;
    const next: ActivityItem = {
      ...cur,
      status,
      endedAt,
      ...(err?.message !== undefined && { errorMessage: err.message }),
    };
    this.items.set(id, next);
    this.emit({ kind: "updated", item: next });

    const lingerMs =
      status === "done"
        ? (cur.lingerMs ?? DEFAULT_LINGER_MS)
        : (cur.failedLingerMs ?? DEFAULT_FAILED_LINGER_MS);
    const t = this.setTimer(() => {
      this.timers.delete(id);
      if (this.items.get(id) === next) this.removeNow(id);
    }, lingerMs);
    // biome-ignore lint/suspicious/noExplicitAny: NodeJS.Timeout has unref; browser timers don't
    (t as any).unref?.();
    this.timers.set(id, t);
  }

  private removeNow(id: string): void {
    const t = this.timers.get(id);
    if (t) {
      this.clearTimer(t);
      this.timers.delete(id);
    }
    if (this.items.delete(id)) this.emit({ kind: "removed", id });
  }

  private emit(event: ActivityEvent): void {
    notifyListeners(this.listeners, event, this.deps.log, "activity");
  }
}
