import type { ImportedPackClient, PackSummaryClient } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UsePacksResult {
  packs: PackSummaryClient[];
  loading: boolean;
  error: string | null;
  /** packId currently being imported, or null if no import is in flight. */
  importing: string | null;
  refresh: () => Promise<void>;
  /** Import a pack by id. Updates `packs` in place after success. */
  importPack: (packId: string) => Promise<ImportedPackClient | null>;
}

/**
 * Hook that fetches available knowledge packs and exposes an `importPack` action.
 * Pattern mirrors use-courses.ts — loading/error/refresh state, mount-effect.
 *
 * `importPack` sets `importing` while the IPC call is in flight, then calls
 * `refresh()` to re-fetch the updated list (which will show `imported: true`).
 * On failure it clears `importing` and re-throws so the caller can surface the error.
 */
export function usePacks(): UsePacksResult {
  const client = usePraxisClient();
  const [packs, setPacks] = useState<PackSummaryClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.packs.listAvailable();
      setPacks(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const importPack = useCallback(
    async (packId: string): Promise<ImportedPackClient | null> => {
      setImporting(packId);
      try {
        const result = await client.packs.import(packId);
        // Refresh the pack list so `imported` badges update.
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setImporting(null);
      }
    },
    [client, refresh],
  );

  return { packs, loading, error, importing, refresh, importPack };
}
