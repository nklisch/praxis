/**
 * IndexerOrchestratorImpl — debounce + run-at-end orchestration.
 *
 * Manages per-session debounce timers for post-turn indexers and synchronous
 * session-end passes. Failures in individual indexers are isolated and logged.
 */

import { episodicEvents } from "@praxis/memory/schema";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type {
  ActivityRegistry,
  EngineEvent,
  Indexer,
  IndexerContext,
  IndexerOrchestrator,
  Logger,
  SessionId,
  StudentId,
  Timestamp,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";

export interface IndexerOrchestratorDeps {
  db: PraxisDb;
  log: Logger;
  indexers: ReadonlyArray<Indexer>;
  /** Debounce for post-turn indexers in ms. Default 3000. */
  debounceMs?: number;
  /**
   * Maximum events to consider per indexer run. Default 100.
   * Filters from the beginning of the session (respecting turnFloor) to prevent
   * unbounded reads on long sessions.
   */
  maxEventsPerRun?: number;
  /**
   * Activity registry for ambient progress reporting via the activity rail.
   * Optional so tests that don't wire activity stay simple.
   */
  activity?: ActivityRegistry;
}

export class IndexerOrchestratorImpl implements IndexerOrchestrator {
  /** sessionId → NodeJS.Timeout */
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /**
   * sessionId → last-seen-turnIndex floor.
   * Post-turn runs see only events with turnIndex >= this floor.
   * Reset to 0 at construction; advanced after each successful run.
   */
  private readonly turnFloors = new Map<string, number>();
  /** sessionId -> serialized in-flight/queued indexer work. */
  private readonly sessionRuns = new Map<string, Promise<void>>();

  constructor(private readonly deps: IndexerOrchestratorDeps) {}

  // ── IndexerOrchestrator interface ─────────────────────────────────────────────

  scheduleAfterTurn(input: { studentId: StudentId; sessionId: SessionId }): void {
    // Cancel any pending timer for this session (debounce collapse).
    this.cancel(input.sessionId);

    const debounce = this.deps.debounceMs ?? 3000;
    const timer = setTimeout(() => {
      this.timers.delete(input.sessionId);
      this.enqueueSessionRun(input.sessionId, () => this.runScope("post-turn", input, true)).catch(
        (err) => {
          this.deps.log.warn("indexer.post_turn_failed", { error: String(err) });
        },
      );
    }, debounce);

    // unref so timers don't keep the process alive (critical for Electron main).
    timer.unref?.();
    this.timers.set(input.sessionId, timer);
  }

  async runAtSessionEnd(input: { studentId: StudentId; sessionId: SessionId }): Promise<void> {
    // Cancel any pending debounce (runAtSessionEnd handles the work synchronously).
    this.cancel(input.sessionId);

    // Session-end indexers always see the full session (no turnFloor restriction).
    await this.enqueueSessionRun(input.sessionId, () => this.runScope("session-end", input, false));

    // Also run post-turn indexers once more to catch any signal from the final turn
    // that the debounce window may have missed.
    await this.enqueueSessionRun(input.sessionId, () => this.runScope("post-turn", input, true));
  }

  cancel(sessionId: SessionId): void {
    const t = this.timers.get(sessionId);
    if (t) {
      clearTimeout(t);
      this.timers.delete(sessionId);
    }
  }

  pendingCount(): number {
    return this.timers.size;
  }

  /** Tear down all timers. Call on host shutdown. */
  shutdown(): void {
    for (const t of this.timers.values()) {
      clearTimeout(t);
    }
    this.timers.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  private enqueueSessionRun(sessionId: SessionId, run: () => Promise<void>): Promise<void> {
    const previous = this.sessionRuns.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(run);
    this.sessionRuns.set(sessionId, next);
    next
      .finally(() => {
        if (this.sessionRuns.get(sessionId) === next) {
          this.sessionRuns.delete(sessionId);
        }
      })
      .catch(() => undefined);
    return next;
  }

  private async runScope(
    schedule: "post-turn" | "session-end",
    input: { studentId: StudentId; sessionId: SessionId },
    fromFloor: boolean,
  ): Promise<void> {
    const indexers = this.deps.indexers.filter((i) => i.schedule === schedule);
    if (indexers.length === 0) return;

    const floor = fromFloor ? (this.turnFloors.get(input.sessionId) ?? 0) : 0;
    const events = this.readEvents(input.sessionId, floor);
    if (events.length === 0) return;

    // Report to the activity rail. quietPeriodMs: 800 so quick runs (< 800ms)
    // never blip the rail — only slow indexer passes surface as visible activity.
    const label = schedule === "post-turn" ? "thinking" : "wrapping up";
    const actHandle = this.deps.activity?.start({
      label,
      quietPeriodMs: 800,
    });

    const ctx: IndexerContext = {
      studentId: input.studentId,
      sessionId: input.sessionId,
      events,
      log: this.deps.log,
    };

    try {
      // Run indexers in parallel; per-indexer failures are isolated.
      await Promise.all(
        indexers.map(async (idx) => {
          try {
            await idx.run(ctx);
          } catch (err) {
            this.deps.log.warn(`indexer.${idx.id}.failed`, { error: String(err) });
          }
        }),
      );
      actHandle?.finish("done");
    } catch (err) {
      actHandle?.finish("failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    // Advance turn floor for next post-turn pass.
    if (schedule === "post-turn") {
      const lastTurn = events.at(-1)?.turnIndex ?? 0;
      const nextFloor = lastTurn + 1;
      const currentFloor = this.turnFloors.get(input.sessionId) ?? 0;
      this.turnFloors.set(input.sessionId, Math.max(currentFloor, nextFloor));
    }
  }

  private readEvents(sessionId: SessionId, fromTurn: number): IndexerContext["events"] {
    const max = this.deps.maxEventsPerRun ?? 100;
    const rows = this.deps.db
      .select()
      .from(episodicEvents)
      .where(
        and(
          eq(episodicEvents.sessionId, sessionId),
          gte(episodicEvents.turnIndex, fromTurn),
          isNull(episodicEvents.redactedAt),
        ),
      )
      .orderBy(asc(episodicEvents.turnIndex), asc(episodicEvents.ts))
      .limit(max)
      .all();

    return rows.map((r) => ({
      id: brandId<"EventId">(r.id),
      turnIndex: r.turnIndex,
      ts: r.ts.getTime() as Timestamp,
      event: r.eventJson as EngineEvent,
    }));
  }
}
