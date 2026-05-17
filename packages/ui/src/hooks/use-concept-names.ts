import type { CourseId } from "@praxis/core/types";
import { useCallback, useMemo } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

export interface ConceptLookup {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly aliases: ReadonlyArray<string>;
}

export interface UseConceptNamesResult {
  /** Full concept rows for the course, in stable order. */
  concepts: ReadonlyArray<ConceptLookup>;
  /** O(1) lookup by id. Returns null if unknown (still-loading or removed). */
  getById: (id: string) => ConceptLookup | null;
  /** Name with id fallback. Use for display when the lookup may still be loading. */
  getName: (id: string) => string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EMPTY_CONCEPTS: ReadonlyArray<ConceptLookup> = [];

/**
 * Course-scoped concept-name lookup hook.
 *
 * Wraps `client.artifacts.concepts(courseId)` via `useResource`. Builds a
 * `Map<string, ConceptLookup>` from the loaded array (memoised on the array
 * identity) and returns `{ concepts, getById, getName, loading, error, refresh }`.
 *
 * `getName(unknownId)` returns the id itself as a fallback — this preserves
 * debuggability when names haven't loaded or a stale id lingers.
 *
 * When `courseId` is `undefined`, returns `concepts: []` and identity
 * `getName: (id) => id` without firing any IPC.
 *
 * See feature epic-editorial-polish-pass-concept-name-surfacing.
 */
export function useConceptNames(courseId: CourseId | undefined): UseConceptNamesResult {
  const client = usePraxisClient();

  const loader = useCallback(async () => {
    if (!courseId) return null;
    return client.artifacts.concepts(courseId);
  }, [client, courseId]);

  const { data, loading, error, refresh } = useResource(loader);

  const concepts: ReadonlyArray<ConceptLookup> = useMemo(() => {
    if (!data) return EMPTY_CONCEPTS;
    // Project to ConceptLookup — keep only the fields we actually use.
    return data.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? "",
      aliases: c.aliases ?? [],
    }));
  }, [data]);

  const byId = useMemo(() => {
    const m = new Map<string, ConceptLookup>();
    for (const c of concepts) m.set(c.id, c);
    return m;
  }, [concepts]);

  const getById = useCallback((id: string) => byId.get(id) ?? null, [byId]);
  const getName = useCallback((id: string) => byId.get(id)?.name ?? id, [byId]);

  return {
    concepts,
    getById,
    getName,
    loading,
    error,
    refresh: async () => {
      await refresh();
    },
  };
}
