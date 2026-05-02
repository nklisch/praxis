import type { CourseId, Gate, GateView, Lesson } from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import type { UseResourceResult } from "./use-resource.js";
import { useResource } from "./use-resource.js";

export interface GatesData {
  lessons: Lesson[];
  gateViews: GateView[];
  gates: Gate[];
}

/**
 * Loads lessons, gate views, and raw gates for a given course.
 * Returns the combined data via useResource so callers get the canonical
 * { data, loading, error, refresh, setData } shape.
 *
 * When courseId is undefined, resolves immediately to empty arrays.
 */
export function useGates(courseId: CourseId | undefined): UseResourceResult<GatesData> {
  const client = usePraxisClient();

  const loader = useCallback(async (): Promise<GatesData> => {
    if (!courseId) {
      return { lessons: [], gateViews: [], gates: [] };
    }
    const [lessons, gateViews, gates] = await Promise.all([
      client.artifacts.lessons(courseId),
      client.artifacts.gateView(courseId),
      client.artifacts.gates(courseId),
    ]);
    return { lessons, gateViews, gates };
  }, [client, courseId]);

  return useResource(loader);
}
