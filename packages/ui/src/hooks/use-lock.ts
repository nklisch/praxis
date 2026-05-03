import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

export interface UseLockResult {
  isSet: boolean;
  isUnlocked: boolean;
  loading: boolean;
  error: string | null;
  setLockCode: (code: string) => Promise<void>;
  unlock: (code: string) => Promise<{ ok: boolean }>;
  lock: () => Promise<void>;
  clearLock: (currentCode: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook that reads the lock state from the process-scoped LockService.
 *
 * On mount: fetches isSet + isUnlocked in parallel.
 * refresh(): re-fetches both (call after lock() or setLockCode() to update UI).
 *
 * unlock() returns { ok: boolean } so callers can show error state on wrong code.
 */
export function useLock(): UseLockResult {
  const client = usePraxisClient();

  const loader = useCallback(async () => {
    if (!client.lock) return { isSet: false, isUnlocked: true };
    const [isSet, isUnlocked] = await Promise.all([client.lock.isSet(), client.lock.isUnlocked()]);
    return { isSet, isUnlocked };
  }, [client]);

  const { data, loading: resourceLoading, error, refresh, setData } = useResource(loader);

  // Treat data === undefined as still loading — preserves the original behavior where
  // loading starts true and guards downstream effects (e.g., configure session start)
  // from firing before the lock check completes.
  const loading = resourceLoading || data === undefined;
  const { isSet = false, isUnlocked = true } = data ?? {};

  const setLockCode = useCallback(
    async (code: string) => {
      if (!client.lock) throw new Error("Lock client not available");
      await client.lock.setLockCode(code);
      await refresh();
    },
    [client, refresh],
  );

  const unlock = useCallback(
    async (code: string): Promise<{ ok: boolean }> => {
      if (!client.lock) return { ok: false };
      const result = await client.lock.unlock(code);
      if (result.ok) {
        setData((prev) => ({ ...(prev ?? { isSet: true, isUnlocked: false }), isUnlocked: true }));
      }
      return result;
    },
    [client, setData],
  );

  const lock = useCallback(async () => {
    if (!client.lock) return;
    await client.lock.lock();
    setData((prev) => ({ ...(prev ?? { isSet: false, isUnlocked: true }), isUnlocked: false }));
  }, [client, setData]);

  const clearLock = useCallback(
    async (currentCode: string) => {
      if (!client.lock) return;
      await client.lock.clearLock(currentCode);
      setData({ isSet: false, isUnlocked: true });
    },
    [client, setData],
  );

  return { isSet, isUnlocked, loading, error, setLockCode, unlock, lock, clearLock, refresh };
}
