import type { CourseId, GateView } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

/** Minimal concept shape returned by client.artifacts.concepts(). */
export interface ConceptRow {
  id: string;
  graphId: string;
  name: string;
  description: string;
  aliases: string[];
  standardsTags: string[];
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
 * All three calls are parallel. The hook returns `loading: true` until all
 * three resolve. Errors from any call surface as `error`.
 *
 * Called from CourseMapRoute. `refresh()` is exposed so Phase 11's gate editor
 * can re-fetch after persisting edits without needing to remount.
 */
export function useCourseGates(courseId: CourseId | undefined): UseCourseGatesResult {
  const client = usePraxisClient();
  const [gates, setGates] = useState<GateView[]>([]);
  const [conceptsById, setConceptsById] = useState<Map<string, ConceptRow>>(new Map());
  const [masteryByConceptId, setMasteryByConceptId] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch all three in parallel for performance.
      const [gatesResult, conceptsResult, studentModel] = await Promise.all([
        client.artifacts.gateView(courseId),
        client.artifacts.concepts(courseId),
        client.memory.studentModel(),
      ]);

      setGates(gatesResult);

      // Build concept lookup by prefixed id.
      const byId = new Map<string, ConceptRow>();
      for (const c of conceptsResult) {
        byId.set(c.id, c);
      }
      setConceptsById(byId);

      // Build mastery lookup: conceptId → effectivePKnown.
      // The student model's Map keys are branded ConceptId (string-typed).
      const masteryMap = new Map<string, number>();
      for (const [conceptId, mastery] of studentModel.conceptMastery.entries()) {
        masteryMap.set(conceptId, mastery.effectivePKnown);
      }
      setMasteryByConceptId(masteryMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, courseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { gates, conceptsById, masteryByConceptId, loading, error, refresh };
}
