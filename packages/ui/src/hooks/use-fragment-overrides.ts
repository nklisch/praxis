import type { FragmentOverride } from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

export interface UseFragmentOverridesResult {
  byId: Map<string, string>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads stored fragment overrides for a mode and returns them as a Map keyed
 * by fragmentId. Backed by `client.author.listFragmentOverrides(modeId)`.
 *
 * Per the use-resource-hook pattern: loads on mount, re-fetches when modeId
 * changes. Callers call `refresh()` after mutations to keep badges in sync.
 */
export function useFragmentOverrides(modeId: string): UseFragmentOverridesResult {
  const client = usePraxisClient();

  const loader = useCallback(() => client.author.listFragmentOverrides(modeId), [client, modeId]);

  const { data, loading, error, refresh } = useResource<FragmentOverride[]>(loader);

  const byId = new Map<string, string>();
  for (const o of data ?? []) byId.set(o.fragmentId, o.override);

  return { byId, loading, error, refresh };
}
