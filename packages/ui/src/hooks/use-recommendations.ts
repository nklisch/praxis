import type { Recommendation } from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

export interface UseRecommendationsResult {
  readonly recommendations: ReadonlyArray<Recommendation>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

/**
 * Fetches the what's-next recommendation queue on mount.
 *
 * Wraps `client.recommendations.next({ limit })` via `useResource`.
 * Returns an empty array until the first load completes.
 */
export function useRecommendations(opts: { limit?: number } = {}): UseRecommendationsResult {
  const client = usePraxisClient();
  const { limit = 5 } = opts;

  const loader = useCallback(
    (): Promise<Recommendation[]> => client.recommendations.next({ limit }),
    [client, limit],
  );

  const { data, loading, error, refresh } = useResource(loader);

  return {
    recommendations: data ?? [],
    loading,
    error,
    refresh,
  };
}
