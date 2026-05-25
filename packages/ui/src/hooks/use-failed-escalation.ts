/**
 * composer-async-behavior step-6: Failure-escalation to activity strip.
 *
 * Watches a list of `failed` PendingMessageItems and, for each item,
 * schedules a timer to escalate the failure to the activity strip after
 * `thresholdMs` (default 30 s) if the user hasn't retried or removed.
 *
 * Lifecycle per item:
 *   1. Item appears in failedItems → schedule timer `thresholdMs - (Date.now() - failedAt)`
 *   2. Timer fires → call `activity.start(...)` to surface in the status strip
 *   3. Item disappears (retry / remove) before timer → clearTimeout + finish handle
 *   4. Same id re-appears with newer failedAt (retry then fails again) → clear + reschedule
 *   5. Unmount → clear all timers + finish all open handles
 *
 * Graceful: when `activity` is null/undefined the hook is a no-op.
 *
 * Pattern: activity-rail-producer (service-deps-injection pattern);
 * no blocking modal — escalation surfaces via the ambient StatusStrip only.
 */
import type { ActivityHandle, ActivityStartInput } from "@praxis/core/types";
import { useEffect, useRef } from "react";
import type { PendingMessageItem } from "./use-streamed-send.js";

export const DEFAULT_ESCALATION_THRESHOLD_MS = 30_000;

/**
 * Minimal interface a caller must satisfy to create activity-strip entries.
 * Matches the `start()` signature of `ActivityRegistry` on the server side.
 * The UI threading it in will obtain an instance through whatever mechanism
 * is available (e.g. a future client IPC call or a server-threaded registry
 * injected via props at the ChatTabBody level).
 */
export interface ActivityRegistryClient {
  start(input: ActivityStartInput): ActivityHandle;
}

export interface UseFailedEscalationOpts {
  /** Items already filtered to `status === "failed"`. */
  failedItems: ReadonlyArray<PendingMessageItem>;
  /** Activity producer — omit or pass null to degrade gracefully. */
  activity?: ActivityRegistryClient | null;
  /** How long after `failedAt` to escalate. Defaults to 30 000 ms. */
  thresholdMs?: number;
}

interface EscalationEntry {
  /** `failedAt` captured when the timer was last scheduled. */
  failedAt: number;
  /** NodeJS/browser timer handle. */
  timer: ReturnType<typeof setTimeout>;
  /** Activity handle returned by `activity.start()`. Present only after escalation fires. */
  handle?: ActivityHandle;
}

/**
 * Per-tab hook that escalates unattended failed messages to the activity strip.
 *
 * Returns `void` — all side-effects are managed internally via refs.
 */
export function useFailedEscalation({
  failedItems,
  activity,
  thresholdMs = DEFAULT_ESCALATION_THRESHOLD_MS,
}: UseFailedEscalationOpts): void {
  // Map<itemId, EscalationEntry> — keyed by PendingMessageItem.id.
  const entriesRef = useRef<Map<string, EscalationEntry>>(new Map());

  useEffect(() => {
    const entries = entriesRef.current;
    const now = Date.now();

    // ── Step 1: Build a set of currently-failed item ids for fast lookup ──
    const currentIds = new Set(failedItems.map((it) => it.id));

    // ── Step 2: Clear entries for items that are no longer failed ──
    for (const [id, entry] of entries) {
      if (!currentIds.has(id)) {
        clearTimeout(entry.timer);
        if (entry.handle !== undefined) {
          entry.handle.finish("failed");
        }
        entries.delete(id);
      }
    }

    // ── Step 3: Add / reschedule entries for current failed items ──
    for (const item of failedItems) {
      const failedAt = item.failedAt ?? now;
      const existing = entries.get(item.id);

      if (existing !== undefined) {
        // Re-failure of the same id? Check if failedAt changed (retry then fail again).
        if (existing.failedAt === failedAt) {
          // Same failure instance — timer already running; nothing to do.
          continue;
        }
        // New failedAt → clear the old timer + handle, then reschedule.
        clearTimeout(existing.timer);
        if (existing.handle !== undefined) {
          existing.handle.finish("failed");
        }
        entries.delete(item.id);
      }

      // Schedule escalation: remaining time = thresholdMs − elapsed.
      // Clamp to 0 so items that were already past the threshold when the
      // hook first renders still escalate (on next microtask).
      const elapsed = now - failedAt;
      const remaining = Math.max(0, thresholdMs - elapsed);

      const capturedId = item.id;
      const timer = setTimeout(() => {
        if (activity == null) {
          // Graceful degradation — no registry calls, but clean up the entry.
          entries.delete(capturedId);
          return;
        }
        const handle = activity.start({
          label: "Queued message failed to send",
          metadata: { messageId: capturedId },
        });
        const existingEntry = entries.get(capturedId);
        if (existingEntry !== undefined) {
          existingEntry.handle = handle;
        }
        // If entry was already removed (item disappeared before timer fired)
        // we still have the handle — finish it immediately.
        if (!entries.has(capturedId)) {
          handle.finish("failed");
        }
      }, remaining);

      entries.set(capturedId, { failedAt, timer });
    }
  }, [failedItems, activity, thresholdMs]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      for (const entry of entriesRef.current.values()) {
        clearTimeout(entry.timer);
        if (entry.handle !== undefined) {
          entry.handle.finish("failed");
        }
      }
      entriesRef.current.clear();
    };
  }, []);
}
