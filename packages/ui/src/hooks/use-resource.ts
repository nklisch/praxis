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

export interface UseResourceOptions {
  /** If false, the resource is not loaded on mount/update. Default: true. */
  enabled?: boolean;
}

/**
 * Hook for loading an async resource with loading/error state and a refresh
 * callback. Loads on mount; re-runs whenever the loader's identity changes
 * (caller controls this via deps in their useCallback).
 *
 * Usage:
 *   const loader = useCallback((signal) => client.notes.list({ courseId }, { signal }), [client, courseId]);
 *   const { data, loading, error, refresh, setData } = useResource(loader);
 */
export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  options: UseResourceOptions = {},
): UseResourceResult<T> {
  const { enabled = true } = options;

  const [data, setDataInternal] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await loader(signal);
        if (!signal.aborted) {
          setDataInternal(result);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [loader],
  );

  useEffect(() => {
    if (!enabled) return;

    const ac = new AbortController();
    refresh(ac.signal);

    return () => {
      ac.abort();
    };
  }, [refresh, enabled]);

  const setData = useCallback((next: T | ((prev: T | undefined) => T)) => {
    setDataInternal((prev) =>
      typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next,
    );
  }, []);

  const refreshExternal = useCallback(async () => {
    const ac = new AbortController();
    return refresh(ac.signal);
  }, [refresh]);

  return { data, loading, error, refresh: refreshExternal, setData };
}
