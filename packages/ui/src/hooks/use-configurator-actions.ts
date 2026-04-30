import type { ConfiguratorActionRow, Timestamp } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseConfiguratorActionsResult {
  actions: ConfiguratorActionRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches the configurator audit log via client.author.listConfiguratorActions.
 * Used in the Memory tab's Audit sub-tab.
 */
export function useConfiguratorActions(opts?: {
  fromTs?: Timestamp;
  limit?: number;
}): UseConfiguratorActionsResult {
  const client = usePraxisClient();
  const [actions, setActions] = useState<ConfiguratorActionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await client.author.listConfiguratorActions(opts ?? {});
      setActions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, opts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { actions, loading, error, refresh };
}
