/**
 * SessionSweepIndexer — periodic background job that discards idle unpromoted
 * sessions and cleans up orphan tab rows.
 *
 * Runs on a plain `setInterval` (not the IndexerOrchestrator "post-turn"
 * schedule) because it operates independently of user turns. Registered in
 * `buildServices`; clear the interval on shutdown.
 *
 * Two passes per sweep:
 *  1. Discard registry entries whose `startedAt` is older than `idleMs`.
 *  2. DELETE FROM tabs WHERE session_id references a session that neither
 *     exists in the `sessions` table nor is currently in the registry.
 *
 * Config keys (via config_kv "session.sweep"):
 *   cadenceMs  — how often the sweep runs (default 10 min)
 *   idleMs     — how long before an unpromoted session is considered idle (default 30 min)
 */

import type { PraxisDb } from "../../db/index.js";
import type { Logger } from "../../types/index.js";
import type { SessionPromotionRegistry } from "./session-promotion-registry.js";

export interface SessionSweepConfig {
  cadenceMs: number;
  idleMs: number;
}

export interface SessionSweepIndexerDeps {
  registry: SessionPromotionRegistry;
  db: PraxisDb;
  log: Logger;
  /**
   * Lazy-resolver thunk: read config at sweep time so changes via config_kv
   * reflect without a restart. Returns the cadenceMs and idleMs values.
   */
  config: () => SessionSweepConfig;
}

const DEFAULT_CADENCE_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_IDLE_MS = 30 * 60 * 1000; // 30 minutes

export const SESSION_SWEEP_CONFIG_DEFAULTS: SessionSweepConfig = {
  cadenceMs: DEFAULT_CADENCE_MS,
  idleMs: DEFAULT_IDLE_MS,
};

export class SessionSweepIndexer {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: SessionSweepIndexerDeps) {}

  /**
   * Start the sweep interval. Uses the cadenceMs from the config thunk at
   * start time; calling start() again after stop() re-reads cadenceMs.
   *
   * Only one interval is active at a time — calling start() when already
   * running is a no-op.
   */
  start(): void {
    if (this.intervalHandle !== null) return;
    const { cadenceMs } = this.deps.config();
    this.intervalHandle = setInterval(() => {
      void this.run();
    }, cadenceMs);
  }

  /** Clear the interval. Safe to call multiple times or before start(). */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Run one sweep pass synchronously (well, mostly — discard() is async).
   * Called by the interval; also called directly in tests.
   */
  async run(): Promise<void> {
    const { idleMs } = this.deps.config();
    const cutoff = Date.now() - idleMs;
    const log = this.deps.log.child({ component: "session-sweep-indexer" });

    // ── Pass 1: discard idle unpromoted sessions ──────────────────────────────
    // Snapshot entries first so we don't mutate the map during iteration.
    const idle: string[] = [];
    for (const [sid, state] of this.deps.registry.entries()) {
      if (state.startedAt < cutoff) {
        idle.push(sid);
      }
    }
    for (const sid of idle) {
      try {
        await this.deps.registry.discard(sid as Parameters<typeof this.deps.registry.discard>[0]);
        log.info("session-sweep.discarded", { sessionId: sid, reason: "idle" });
      } catch (err) {
        log.warn("session-sweep.discard_failed", { sessionId: sid, err: String(err) });
      }
    }

    // ── Pass 2: orphan-tab cleanup ───────────────────────────────────────────
    // Delete tabs whose session_id points at a session that neither exists in
    // the `sessions` table nor is currently tracked by the registry.
    //
    // We build the registry id list AFTER pass 1 so newly-discarded sessions
    // are excluded (their tab rows were already deleted by discard()).
    const registryIds = [...this.deps.registry.entries()].map(([sid]) => sid);

    try {
      if (registryIds.length > 0) {
        // Inline the registry ids as a SQL literal. Safe because:
        //  a) These are UUID strings from our own in-memory map (no user input).
        //  b) Registry size is always small (< 100 in practice).
        const placeholders = registryIds.map((id) => `'${id}'`).join(", ");
        this.deps.db.run(
          `DELETE FROM tabs
           WHERE session_id IS NOT NULL
             AND session_id NOT IN (SELECT id FROM sessions)
             AND session_id NOT IN (${placeholders})`,
        );
      } else {
        // No registry entries — any tab with an unrecognised session_id is orphaned.
        this.deps.db.run(
          `DELETE FROM tabs
           WHERE session_id IS NOT NULL
             AND session_id NOT IN (SELECT id FROM sessions)`,
        );
      }
      log.debug("session-sweep.orphan_tabs_cleaned");
    } catch (err) {
      log.warn("session-sweep.orphan_tab_cleanup_failed", { err: String(err) });
    }
  }
}
