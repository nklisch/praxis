import type { ImportedPackClient, PackSummaryClient } from "@praxis/core/types";
import { useCallback, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

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
 * Uses useResource for loading/error/refresh state and mount-effect.
 *
 * `importPack` sets `importing` while the IPC call is in flight, then calls
 * `refresh()` to re-fetch the updated list (which will show `imported: true`).
 * On failure it sets a local importError (surfaced as `error`) and returns null.
 */
export function usePacks(): UsePacksResult {
  const client = usePraxisClient();
  const [importing, setImporting] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const loader = useCallback(() => client.packs.listAvailable(), [client]);

  const { data: packs = [], loading, error: loadError, refresh } = useResource(loader);

  // Expose the most recent error — importError takes precedence when set.
  const error = importError ?? loadError;

  const importPack = useCallback(
    async (packId: string): Promise<ImportedPackClient | null> => {
      setImporting(packId);
      setImportError(null);
      try {
        const result = await client.packs.import(packId);
        // Refresh the pack list so `imported` badges update.
        await refresh();
        return result;
      } catch (err) {
        setImportError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setImporting(null);
      }
    },
    [client, refresh],
  );

  return { packs, loading, error, importing, refresh, importPack };
}
