import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

/** Hard ceiling enforced server-side; mirrored here for client-side clamping. */
export const COURSE_CREATE_BUDGET_MAX = 200;
export const COURSE_CREATE_BUDGET_MIN = 5;

export interface UseCourseCreateBudgetResult {
  /** Current value. Null while loading. */
  maxSteps: number | null;
  /** True while a load or save is in flight. */
  saving: boolean;
  /**
   * Persist a new budget. Clamps to [COURSE_CREATE_BUDGET_MIN, COURSE_CREATE_BUDGET_MAX]
   * before sending. Optimistic — updates `maxSteps` immediately, reverts on error.
   */
  setMaxSteps: (next: number) => Promise<void>;
  /** Last error from a load or save, if any. */
  error: string | null;
}

/**
 * Read + write the user's course-create-mode tool-call budget. Loads on mount via
 * `client.config.courseCreateConfig()`. The config is the single source of truth
 * — `course.start_drafting` reads it server-side at call time, so a saved
 * change applies to the next drafting run without restarting the app.
 */
export function useCourseCreateBudget(): UseCourseCreateBudgetResult {
  const client = usePraxisClient();
  const [maxSteps, setLocalMaxSteps] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await client.config.courseCreateConfig();
        if (!cancelled) setLocalMaxSteps(cfg.maxSteps);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const setMaxSteps = useCallback(
    async (next: number) => {
      const clamped = Math.max(
        COURSE_CREATE_BUDGET_MIN,
        Math.min(COURSE_CREATE_BUDGET_MAX, Math.floor(next)),
      );
      const previous = maxSteps;
      setLocalMaxSteps(clamped);
      setSaving(true);
      setError(null);
      try {
        await client.config.setCourseCreateConfig({ maxSteps: clamped });
      } catch (err) {
        // Revert on failure so the user sees their original setting.
        setLocalMaxSteps(previous);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [client, maxSteps],
  );

  return { maxSteps, saving, setMaxSteps, error };
}
