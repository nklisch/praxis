import type { CourseSummary } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseCoursesResult {
  courses: CourseSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook that loads the list of confirmed courses for the current student.
 * Mirrors the pattern of useDocuments — loading/error/refresh state, mount-effect.
 */
export function useCourses(): UseCoursesResult {
  const client = usePraxisClient();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.artifacts.courses();
      setCourses(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Load on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { courses, loading, error, refresh };
}
