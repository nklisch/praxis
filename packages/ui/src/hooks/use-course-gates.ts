import type { CourseId, GateView } from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

/** Minimal concept shape returned by client.artifacts.concepts(). */
export interface ConceptRow {
  id: string;
  graphId: string;
  name: string;
  description: string;
  aliases: string[];
  standardsTags: string[];
}

interface CourseGatesData {
  gates: GateView[];
  conceptsById: Map<string, ConceptRow>;
  masteryByConceptId: Map<string, number>;
}

export interface UseCourseGatesResult {
  gates: GateView[];
  /**
   * Map from prefixed concept id → ConceptRow.
   * Populated by client.artifacts.concepts(courseId).
   * Empty map when concepts are not yet loaded.
   */
  conceptsById: Map<string, ConceptRow>;
  /**
   * Map from prefixed concept id → effective per-concept mastery (0..1).
   * Derived from student model's effectivePKnown.
   * Falls back to 0 for concepts not yet studied.
   */
  masteryByConceptId: Map<string, number>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook that fetches:
 *   1. Enriched gate views for a course (client.artifacts.gateView).
 *   2. Full concept list for the course (client.artifacts.concepts) — Phase 10.
 *   3. Student mastery model (client.memory.studentModel) — Phase 10.
 *
 * All three calls are parallel via Promise.all. Uses useResource for
 * loading/error/refresh state and mount-effect.
 *
 * Called from CourseMapRoute. `refresh()` is exposed so Phase 11's gate editor
 * can re-fetch after persisting edits without needing to remount.
 */
export function useCourseGates(courseId: CourseId | undefined): UseCourseGatesResult {
  const client = usePraxisClient();

  const loader = useCallback(async (): Promise<CourseGatesData> => {
    if (!courseId) {
      return {
        gates: [],
        conceptsById: new Map(),
        masteryByConceptId: new Map(),
      };
    }

    // Fetch all three in parallel for performance.
    const [gatesResult, conceptsResult, studentModel] = await Promise.all([
      client.artifacts.gateView(courseId),
      client.artifacts.concepts(courseId),
      client.memory.studentModel(),
    ]);

    // Build concept lookup by prefixed id.
    const conceptsById = new Map<string, ConceptRow>();
    for (const c of conceptsResult) {
      conceptsById.set(c.id, c);
    }

    // Build mastery lookup: conceptId → effectivePKnown.
    // The student model's Map keys are branded ConceptId (string-typed).
    const masteryByConceptId = new Map<string, number>();
    for (const [conceptId, mastery] of studentModel.conceptMastery.entries()) {
      masteryByConceptId.set(conceptId, mastery.effectivePKnown);
    }

    return { gates: gatesResult, conceptsById, masteryByConceptId };
  }, [client, courseId]);

  const { data, loading, error, refresh } = useResource(loader);

  return {
    gates: data?.gates ?? [],
    conceptsById: data?.conceptsById ?? new Map(),
    masteryByConceptId: data?.masteryByConceptId ?? new Map(),
    loading,
    error,
    refresh,
  };
}
