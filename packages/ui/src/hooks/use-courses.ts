import type { CourseId, CourseSummary } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseCoursesResult {
  courses: CourseSummary[];
  /** Phase 9: map from courseId → count of gates unlocked since last view. */
  newlyUnlocked: Map<CourseId, number>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook that loads the list of confirmed courses for the current student.
 * Mirrors the pattern of useDocuments — loading/error/refresh state, mount-effect.
 *
 * Phase 9: after the courses list loads, fetches newly-unlocked counts per course
 * in parallel. Failures are silent (badge omitted rather than breaking the list).
 */
export function useCourses(): UseCoursesResult {
  const client = usePraxisClient();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Map<CourseId, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.artifacts.courses();
      setCourses(result);

      // Fetch newly-unlocked counts for all courses in parallel.
      // Failures are non-fatal — the badge just won't appear.
      if (result.length > 0) {
        Promise.all(
          result.map(async (c) => {
            try {
              const count = await client.artifacts.newlyUnlockedCount(c.courseId);
              return { courseId: c.courseId, count };
            } catch {
              return { courseId: c.courseId, count: 0 };
            }
          }),
        ).then((entries) => {
          setNewlyUnlocked(new Map(entries.map((e) => [e.courseId, e.count])));
        });
      }
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

  return { courses, newlyUnlocked, loading, error, refresh };
}
