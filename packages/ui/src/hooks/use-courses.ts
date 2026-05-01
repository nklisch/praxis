import type { CourseId, CourseSummary } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

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
 * Uses useResource for loading/error/refresh state and mount-effect.
 *
 * Phase 9: after the courses list loads, fetches newly-unlocked counts per
 * course in parallel via a separate effect. Failures are silent (badge omitted
 * rather than breaking the list).
 */
export function useCourses(): UseCoursesResult {
  const client = usePraxisClient();
  const [newlyUnlocked, setNewlyUnlocked] = useState<Map<CourseId, number>>(new Map());

  const loader = useCallback(() => client.artifacts.courses(), [client]);

  const { data: courses = [], loading, error, refresh } = useResource(loader);

  // Fire-and-forget secondary fetch for newly-unlocked counts.
  // Runs after the course list is populated; failures are non-fatal.
  useEffect(() => {
    if (courses.length === 0) return;
    Promise.all(
      courses.map(async (c) => {
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
  }, [courses, client]);

  return { courses, newlyUnlocked, loading, error, refresh };
}
