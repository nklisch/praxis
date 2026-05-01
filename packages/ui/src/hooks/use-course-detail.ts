import type { Course, CourseId, Lesson } from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

export interface UseCourseDetailResult {
  course: Course | null;
  lessons: Lesson[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook that loads a full course + its ordered lessons for the course detail route.
 * Uses useResource for loading/error/refresh state and mount-effect.
 * Re-fetches if courseId changes.
 */
export function useCourseDetail(courseId: CourseId | undefined): UseCourseDetailResult {
  const client = usePraxisClient();

  const loader = useCallback(async () => {
    if (!courseId) return { course: null, lessons: [] };
    const [course, lessons] = await Promise.all([
      client.artifacts.course(courseId),
      client.artifacts.lessons(courseId),
    ]);
    return { course, lessons };
  }, [client, courseId]);

  const { data, loading, error, refresh } = useResource(loader);

  return {
    course: data?.course ?? null,
    lessons: data?.lessons ?? [],
    loading,
    error,
    refresh,
  };
}
