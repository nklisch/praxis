import { useCallback, useEffect, useState } from "react";

export interface UseResourceResult<T> {
  /** Latest loaded value. `undefined` until the first successful load. */
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** Re-run the loader. Caller decides when to call (e.g., after a mutation). */
  refresh: () => Promise<void>;
  /**
   * Imperatively set the data. Use for optimistic updates after mutations
   * (e.g., remove a deleted item from the list without a roundtrip).
   */
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Hook for loading an async resource with loading/error state and a refresh
 * callback. Loads on mount; re-runs whenever the loader's identity changes
 * (caller controls this via deps in their useCallback).
 *
 * Usage:
 *   const loader = useCallback(() => client.notes.list({ courseId }), [client, courseId]);
 *   const { data, loading, error, refresh, setData } = useResource(loader);
 */
export function useResource<T>(loader: () => Promise<T>): UseResourceResult<T> {
  const [data, setDataInternal] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      setDataInternal(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setData = useCallback((next: T | ((prev: T | undefined) => T)) => {
    setDataInternal((prev) =>
      typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next,
    );
  }, []);

  return { data, loading, error, refresh, setData };
}
