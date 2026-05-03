import type { Timestamp } from "./common.js";

/**
 * One thing the system is doing, surfaced to the user via the activity rail.
 * Items have an editorial label written by the producer (e.g., "reading
 * sullivan algebra & trigonometry"); the rail does not synthesize copy.
 */
export interface ActivityItem {
  /** Stable id chosen by the producer; later updates target this id. */
  readonly id: string;
  /** Editorial-friendly user-facing string. Lowercase by convention. */
  label: string;
  /** Optional secondary line (e.g., "page 12 of 248"). */
  detail?: string;
  /** Optional progress; rendered as a hairline bar when present. */
  progress?: { value: number; total: number };
  status: "running" | "done" | "failed";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  errorMessage?: string;
  /**
   * If set, the item stays HIDDEN from consumers (the rail) until it has
   * been `running` for this many ms. If finish() is called before then,
   * the item is removed without ever being rendered. Used by indexers
   * (default 800ms) so quick post-turn work doesn't blip the rail.
   */
  quietPeriodMs?: number;
  /**
   * How long to keep showing the item after `finish("done")` before
   * removing it. Producer can override; defaults applied by registry.
   */
  lingerMs?: number;
  /**
   * How long to keep showing the item after `finish("failed", ...)`
   * before removing it. Failed items also offer a dismiss affordance
   * regardless of this value.
   */
  failedLingerMs?: number;
}

/**
 * Discriminated event shape streamed from server to renderer. Renderers swap
 * their local Map<id, ActivityItem> by `kind`. `snapshot` is sent first when a
 * client subscribes so it sees the current state without having to wait
 * for the next change.
 */
export type ActivityEvent =
  | { kind: "snapshot"; items: readonly ActivityItem[] }
  | { kind: "added"; item: ActivityItem }
  | { kind: "updated"; item: ActivityItem }
  | { kind: "removed"; id: string };

export interface ActivityStartInput {
  /** Optional stable id; if omitted, the registry assigns a uuid v7. */
  id?: string;
  label: string;
  detail?: string;
  progress?: { value: number; total: number };
  quietPeriodMs?: number;
  lingerMs?: number;
  failedLingerMs?: number;
}

export interface ActivityUpdatePatch {
  label?: string;
  detail?: string;
  progress?: { value: number; total: number };
}

/**
 * Returned by `start()`. Producers hold this and report progress on it.
 * Cheap to throw away if the producer doesn't need to update — the
 * registry still tracks the item by its id.
 */
export interface ActivityHandle {
  readonly id: string;
  update(patch: ActivityUpdatePatch): void;
  finish(status: "done" | "failed", err?: { message: string }): void;
}

/**
 * Server-side port consumed by every long-running producer. Not transport-
 * coupled — `ActivityRegistryImpl` owns the in-memory store; the IPC layer
 * subscribes to this and forwards events to the renderer.
 */
export interface ActivityRegistry {
  start(input: ActivityStartInput): ActivityHandle;
  /** Snapshot of currently-visible items (post quietPeriod, pre-linger-expire). */
  list(): readonly ActivityItem[];
  /** Subscribe to add/update/remove. Returns an unsubscribe fn. */
  subscribe(listener: ActivityListener): () => void;
  /**
   * Drop a `done` or `failed` item early. No-op if id isn't visible or is
   * still `running`. The rail's per-item dismiss affordance calls this via
   * a thin IPC pass-through.
   */
  dismiss(id: string): void;
  /**
   * Mark all running items as `failed` with reason "shut down", clear the
   * registry, and notify subscribers. Called from `before-quit`. Producers
   * are responsible for stopping their own work via their own AbortSignals
   * — the registry doesn't own cancellation, only display.
   */
  shutdown(): void;
}

export type ActivityListener = (event: ActivityEvent) => void;

/**
 * Renderer-side client for the activity rail.
 * `events()` opens a persistent stream that delivers `ActivityEvent`s as they
 * occur. The server delivers a `snapshot` first so the renderer doesn't need
 * to wait for the next change to see current state.
 */
export interface ActivityClient {
  events(): AsyncIterable<ActivityEvent>;
  dismiss(id: string): Promise<void>;
}
