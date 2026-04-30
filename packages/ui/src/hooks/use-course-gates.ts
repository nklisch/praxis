import type { CourseId, GateView } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseCourseGatesResult {
  gates: GateView[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook that fetches the enriched gate views for a course.
 * Pattern mirrors use-course-detail.ts — loading/error/refresh state, mount effect.
 *
 * Called from the CourseMapRoute. `refresh()` is exposed so Phase 11's gate editor
 * can re-fetch after persisting edits without needing to remount.
 */
export function useCourseGates(courseId: CourseId | undefined): UseCourseGatesResult {
  const client = usePraxisClient();
  const [gates, setGates] = useState<GateView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.artifacts.gateView(courseId);
      setGates(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, courseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { gates, loading, error, refresh };
}
