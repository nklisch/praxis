import type {
  Logger,
  SessionId,
  SubAgentEvent,
  SubAgentHandle,
  SubAgentItem,
  SubAgentListener,
  SubAgentRegistry,
  SubAgentStartInput,
  SubAgentStep,
  Timestamp,
} from "../types/index.js";
import { notifyListeners } from "./db-helpers.js";

const DEFAULT_LINGER_MS = 30_000;

export interface SubAgentRegistryDeps {
  log: Logger;
  /**
   * Optional wall-clock now provider (testable seam).
   * Defaults to `Date.now`.
   */
  now?: () => number;
  /** setTimeout-shaped scheduler (testable seam). */
  setTimeout?: typeof globalThis.setTimeout;
  /**
   * Optional label resolver: given a tool name, returns a human-friendly
   * present-tense label (e.g. "Reading pages"). When omitted, falls back
   * to the raw tool name. Typically wired from `getToolLabel(name).present`
   * at the composition root (desktop/electron/main/services.ts) where
   * @praxis/tools/labels is available.
   */
  resolveLabel?: (toolName: string) => string;
}

/**
 * In-memory registry for sub-agent transparency events.
 *
 * Differences from `ActivityRegistryImpl`:
 * - Keyed by `parentCallId` (caller-supplied, not generated uuidv7).
 * - No quiet-period: sub-agent starts are intentional; always surface immediately.
 * - Linger: ~30s after `finished` so the user can read the step history.
 * - `subscribe(listener, { parentCallId })` optionally filters to one item.
 * - Additional event kinds: `step_started`, `step_settled`, `phase_changed`.
 * - Steps are tracked in the item itself; max 200 steps (older drop off).
 */
export class SubAgentRegistryImpl implements SubAgentRegistry {
  private readonly items = new Map<string, SubAgentItem>();
  private readonly listenerEntries = new Set<{
    listener: SubAgentListener;
    filter?: { parentCallId?: string };
  }>();
  private readonly timers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();

  private readonly now: () => number;
  private readonly setTimer: typeof globalThis.setTimeout;
  private readonly resolveLabel: (toolName: string) => string;

  private static readonly MAX_STEPS = 200;

  constructor(private readonly deps: SubAgentRegistryDeps) {
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimeout ?? globalThis.setTimeout;
    this.resolveLabel = deps.resolveLabel ?? ((name) => name);
  }

  start(input: SubAgentStartInput): SubAgentHandle {
    const { parentCallId, sessionId, label } = input;
    if (this.items.has(parentCallId)) {
      // Collision is a registry guarantee, not an error: the caller may
      // re-invoke start() for the same parentCallId (e.g. a session resumes
      // a sub-agent stream). Silent-no-op by design — pinned by
      // "start() with same parentCallId is a silent no-op (by design — collision is a registry guarantee, not an error)"
      // in subagent-registry.test.ts.
      this.deps.log.debug("subagent-registry.start.collision", { parentCallId });
      return this.makeHandle(parentCallId);
    }

    const item: SubAgentItem = {
      parentCallId,
      sessionId,
      label,
      status: "running",
      startedAt: this.now() as Timestamp,
      steps: [],
    };
    this.items.set(parentCallId, item);
    this.emit({ kind: "started", item });
    return this.makeHandle(parentCallId);
  }

  list(): readonly SubAgentItem[] {
    return Array.from(this.items.values());
  }

  subscribe(listener: SubAgentListener, filter?: { parentCallId?: string }): () => void {
    const entry: { listener: SubAgentListener; filter?: { parentCallId?: string } } =
      filter !== undefined ? { listener, filter } : { listener };
    // Deliver immediate snapshot (filtered if requested).
    const snapshot: SubAgentItem[] = filter?.parentCallId
      ? Array.from(this.items.values()).filter((i) => i.parentCallId === filter.parentCallId)
      : Array.from(this.items.values());
    try {
      listener({ kind: "snapshot", items: snapshot });
    } catch (err) {
      this.deps.log.warn("subagent-registry.listener_threw", { err: String(err) });
    }
    this.listenerEntries.add(entry);
    return () => {
      this.listenerEntries.delete(entry);
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private makeHandle(parentCallId: string): SubAgentHandle {
    return {
      parentCallId,
      stepStarted: ({ callId, toolName }) => this.onStepStarted(parentCallId, callId, toolName),
      stepSettled: ({ callId, ok }) => this.onStepSettled(parentCallId, callId, ok),
      setLabel: (label) => this.onSetLabel(parentCallId, label),
      finish: (status, err) => this.onFinish(parentCallId, status, err),
    };
  }

  private onStepStarted(parentCallId: string, callId: string, toolName: string): void {
    const item = this.items.get(parentCallId);
    if (!item || item.status !== "running") return;
    const step: SubAgentStep = {
      callId,
      toolName,
      label: this.resolveLabel(toolName),
      startedAt: this.now() as Timestamp,
    };
    // Enforce max-steps cap: drop oldest if over limit.
    const steps =
      item.steps.length >= SubAgentRegistryImpl.MAX_STEPS
        ? [...item.steps.slice(1), step]
        : [...item.steps, step];
    const updated: SubAgentItem = { ...item, steps };
    this.items.set(parentCallId, updated);
    this.emit({ kind: "step_started", parentCallId, step });
  }

  private onStepSettled(parentCallId: string, callId: string, ok: boolean): void {
    const item = this.items.get(parentCallId);
    if (!item || item.status !== "running") return;
    const endedAt = this.now() as Timestamp;
    const steps = item.steps.map((s) => (s.callId === callId ? { ...s, ok, endedAt } : s));
    const updated: SubAgentItem = { ...item, steps };
    this.items.set(parentCallId, updated);
    this.emit({ kind: "step_settled", parentCallId, callId, ok });
  }

  private onSetLabel(parentCallId: string, label: string): void {
    const item = this.items.get(parentCallId);
    if (!item || item.status !== "running") return;
    const updated: SubAgentItem = { ...item, label };
    this.items.set(parentCallId, updated);
    this.emit({ kind: "phase_changed", parentCallId, label });
  }

  interruptAllForSession(parentSessionId: SessionId): void {
    for (const [parentCallId, item] of this.items) {
      if (item.sessionId === parentSessionId && item.status === "running") {
        this.onFinish(parentCallId, "interrupted");
      }
    }
  }

  private onFinish(
    parentCallId: string,
    status: "done" | "failed" | "interrupted",
    err?: { message: string },
  ): void {
    const item = this.items.get(parentCallId);
    if (!item || item.status !== "running") return;

    const endedAt = this.now() as Timestamp;
    const finished: SubAgentItem = {
      ...item,
      status,
      endedAt,
      ...(err?.message !== undefined && { errorMessage: err.message }),
    };
    this.items.set(parentCallId, finished);
    this.emit({
      kind: "finished",
      parentCallId,
      status,
      ...(err?.message !== undefined && { errorMessage: err.message }),
    });

    const lingerMs = DEFAULT_LINGER_MS;
    const t = this.setTimer(() => {
      this.timers.delete(parentCallId);
      // Only remove if the item hasn't been replaced (e.g. by a re-start).
      if (this.items.get(parentCallId) === finished) {
        this.items.delete(parentCallId);
      }
    }, lingerMs);
    // biome-ignore lint/suspicious/noExplicitAny: NodeJS.Timeout has unref; browser timers don't
    (t as any).unref?.();
    this.timers.set(parentCallId, t);
  }

  private emit(event: SubAgentEvent): void {
    const targets: SubAgentListener[] = [];
    for (const { listener, filter } of this.listenerEntries) {
      // Apply filter: skip events that don't match the subscribed parentCallId.
      if (filter?.parentCallId !== undefined) {
        const eventParentCallId = getEventParentCallId(event);
        if (eventParentCallId !== null && eventParentCallId !== filter.parentCallId) {
          continue;
        }
        // snapshot events are pre-filtered in subscribe(); don't double-filter them here.
      }
      targets.push(listener);
    }
    notifyListeners(targets, event, this.deps.log, "subagent-registry");
  }
}

/**
 * Extract the parentCallId from an event for filter matching.
 * Returns `null` for events that don't carry a specific parentCallId (snapshot).
 */
function getEventParentCallId(event: SubAgentEvent): string | null {
  switch (event.kind) {
    case "started":
      return event.item.parentCallId;
    case "step_started":
    case "step_settled":
    case "phase_changed":
    case "finished":
      return event.parentCallId;
    case "snapshot":
      return null;
  }
}
