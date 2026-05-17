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
 *
 * Identity-stability note: deps destructure `fromTs` and `limit` from the
 * options object so the `refresh` callback stays stable when callers pass
 * a fresh `{ limit: 100 }` literal each render. Without this destructure
 * the hook re-fetched on every parent re-render, producing a tight loop
 * in the audit-log surface. See loop-flickers-audit story.
 */
export function useConfiguratorActions(opts?: {
  fromTs?: Timestamp;
  limit?: number;
}): UseConfiguratorActionsResult {
  const client = usePraxisClient();
  const fromTs = opts?.fromTs;
  const limit = opts?.limit;
  const [actions, setActions] = useState<ConfiguratorActionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await client.author.listConfiguratorActions({
        ...(fromTs !== undefined && { fromTs }),
        ...(limit !== undefined && { limit }),
      });
      setActions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, fromTs, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { actions, loading, error, refresh };
}
