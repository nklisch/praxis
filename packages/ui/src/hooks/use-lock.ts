import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

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
  const [isSet, setIsSet] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client.lock) return;
    setLoading(true);
    setError(null);
    try {
      const [set, unlocked] = await Promise.all([client.lock.isSet(), client.lock.isUnlocked()]);
      setIsSet(set);
      setIsUnlocked(unlocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      if (result.ok) await refresh();
      return result;
    },
    [client, refresh],
  );

  const lock = useCallback(async () => {
    if (!client.lock) return;
    await client.lock.lock();
    await refresh();
  }, [client, refresh]);

  const clearLock = useCallback(
    async (currentCode: string) => {
      if (!client.lock) return;
      await client.lock.clearLock(currentCode);
      await refresh();
    },
    [client, refresh],
  );

  return { isSet, isUnlocked, loading, error, setLockCode, unlock, lock, clearLock, refresh };
}
