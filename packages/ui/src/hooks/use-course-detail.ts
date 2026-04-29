import type { Course, CourseId, Lesson } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseCourseDetailResult {
  course: Course | null;
  lessons: Lesson[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook that loads a full course + its ordered lessons for the course detail route.
 * Re-fetches if courseId changes.
 */
export function useCourseDetail(courseId: CourseId | undefined): UseCourseDetailResult {
  const client = usePraxisClient();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const [fetchedCourse, fetchedLessons] = await Promise.all([
        client.artifacts.course(courseId),
        client.artifacts.lessons(courseId),
      ]);
      setCourse(fetchedCourse);
      setLessons(fetchedLessons);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, courseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { course, lessons, loading, error, refresh };
}
