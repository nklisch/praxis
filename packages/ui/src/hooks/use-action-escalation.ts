/**
 * useActionEscalation — generalized failure-escalation hook.
 *
 * Watches a list of failed optimistic actions and, for each, schedules a
 * timer to escalate the failure to the activity strip after `thresholdMs`
 * (default 30 000 ms) if the user hasn't retried or dismissed.
 *
 * This is the generalized sibling of `useFailedEscalation` from
 * `feature-composer-async-behavior` (packages/ui/src/hooks/use-failed-escalation.ts).
 * The two hooks share the same temporal logic and two-effect pattern:
 *
 *   1. A reactive effect keyed on `failedActions` — schedules / clears timers.
 *   2. A cleanup-only effect — clears all timers and finishes handles on unmount.
 *
 * Differences from `useFailedEscalation`:
 *   - `failedActions` is `Array<{ id, label, failedAt }>` (arbitrary action ids)
 *     rather than `Array<PendingMessageItem>` (message-specific shape).
 *   - `label` is used directly in the activity-strip entry.
 *   - No `failedAt`-vs-now fallback: `failedAt` is required in the item type.
 *
 * Per-item lifecycle:
 *   1. Item appears in `failedActions` → schedule timer `thresholdMs − (now − failedAt)`
 *   2. Timer fires → call `activity.start(...)` to surface in the status strip
 *   3. Item disappears (retry / dismiss) before timer → clearTimeout + finish handle
 *   4. Same id re-appears with newer `failedAt` (retry then fails again) → clear + reschedule
 *   5. Unmount → clear all timers + finish all open handles
 *
 * Graceful: when `activity` is null/undefined the hook is a no-op (no strip
 * integration, timers still do nothing on fire).
 *
 * Pattern: activity-rail-producer (see service-deps-injection pattern).
 * No blocking modal — escalation surfaces via the ambient StatusStrip only.
 *
 * Note: `useFailedEscalation` in the composer feature can eventually become a
 * thin wrapper around this hook; that's a small follow-on cleanup, not in scope.
 */
import type { ActivityHandle, ActivityStartInput } from "@praxis/core/types";
import { useEffect, useRef } from "react";

export const DEFAULT_ACTION_ESCALATION_THRESHOLD_MS = 30_000;

/**
 * Minimal interface a caller must satisfy to create activity-strip entries.
 * Matches the `start()` signature of `ActivityRegistry` on the server side.
 *
 * Re-exported (rather than re-using the one in use-failed-escalation.ts)
 * so callers can import from a single authoritative location per hook. The
 * two declarations are structurally identical — no duplicate runtime cost.
 */
export interface ActivityRegistryClient {
  start(input: ActivityStartInput): ActivityHandle;
}

/** A failed optimistic action the caller wants to escalate. */
export interface FailedAction {
  id: string;
  /** Human-readable label surfaced in the activity strip. */
  label: string;
  /** Unix ms timestamp of when the action transitioned to "failed". */
  failedAt: number;
}

export interface UseActionEscalationOpts {
  /** Items already filtered to failed state — keyed by id. */
  failedActions: ReadonlyArray<FailedAction>;
  /** Activity producer — omit or pass null/undefined to degrade gracefully. */
  activity?: ActivityRegistryClient | null;
  /** How long after `failedAt` to escalate. Defaults to 30 000 ms. */
  thresholdMs?: number;
}

interface EscalationEntry {
  /** `failedAt` captured when the timer was last scheduled. */
  failedAt: number;
  /** Timer handle. */
  timer: ReturnType<typeof setTimeout>;
  /** Activity handle returned by `activity.start()`. Present only after escalation fires. */
  handle?: ActivityHandle;
}

/**
 * Per-surface hook that escalates unattended failed optimistic actions to the
 * activity strip.
 *
 * Returns `void` — all side-effects are managed internally via refs.
 */
export function useActionEscalation({
  failedActions,
  activity,
  thresholdMs = DEFAULT_ACTION_ESCALATION_THRESHOLD_MS,
}: UseActionEscalationOpts): void {
  // Map<actionId, EscalationEntry>
  const entriesRef = useRef<Map<string, EscalationEntry>>(new Map());

  useEffect(() => {
    const entries = entriesRef.current;
    const now = Date.now();

    // ── Step 1: Build a set of currently-failed action ids for fast lookup ──
    const currentIds = new Set(failedActions.map((a) => a.id));

    // ── Step 2: Clear entries for actions that are no longer failed ──
    for (const [id, entry] of entries) {
      if (!currentIds.has(id)) {
        clearTimeout(entry.timer);
        if (entry.handle !== undefined) {
          entry.handle.finish("failed");
        }
        entries.delete(id);
      }
    }

    // ── Step 3: Add / reschedule entries for current failed actions ──
    for (const action of failedActions) {
      const { failedAt } = action;
      const existing = entries.get(action.id);

      if (existing !== undefined) {
        // Re-failure of the same id? Check if failedAt changed.
        if (existing.failedAt === failedAt) {
          // Same failure instance — timer already running; nothing to do.
          continue;
        }
        // New failedAt → clear the old timer + handle, then reschedule.
        clearTimeout(existing.timer);
        if (existing.handle !== undefined) {
          existing.handle.finish("failed");
        }
        entries.delete(action.id);
      }

      // Schedule escalation: remaining time = thresholdMs − elapsed.
      // Clamp to 0 so items that were already past the threshold when the
      // hook first renders still escalate (on the next microtask).
      const elapsed = now - failedAt;
      const remaining = Math.max(0, thresholdMs - elapsed);

      const capturedId = action.id;
      const capturedLabel = action.label;

      const timer = setTimeout(() => {
        if (activity == null) {
          // Graceful degradation — no registry calls; clean up the entry.
          entries.delete(capturedId);
          return;
        }
        const handle = activity.start({
          label: capturedLabel,
          metadata: { actionId: capturedId },
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
  }, [failedActions, activity, thresholdMs]);

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
