import type {
  CourseSummary,
  DocumentSummary,
  PackSummaryClient,
  SessionSummary,
} from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

export interface LibraryData {
  readonly courses: ReadonlyArray<CourseSummary>;
  readonly packs: ReadonlyArray<PackSummaryClient>;
  readonly documents: ReadonlyArray<DocumentSummary>;
  readonly recentSessions: ReadonlyArray<SessionSummary>;
}

export interface UseLibraryResult {
  readonly data: LibraryData | undefined;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

/**
 * Aggregates all four Library data sources in parallel via `Promise.all`.
 *
 * Uses `useResource` with a multi-read loader (see use-resource-hook pattern).
 * All four sources load at once; if any fails, `error` reflects the failure
 * message and `data` is undefined. Individual section fallbacks (undefined slice)
 * let sections render their own empty states on partial success.
 */
export function useLibrary(): UseLibraryResult {
  const client = usePraxisClient();

  const loader = useCallback(async (): Promise<LibraryData> => {
    const [courses, packs, documents, recentSessions] = await Promise.all([
      client.artifacts.courses(),
      client.packs.listAvailable(),
      client.documents.list(),
      client.session.list({ limit: 10, includeEnded: true, excludeModeIds: ["configure"] }),
    ]);
    return { courses, packs, documents, recentSessions };
  }, [client]);

  const { data, loading, error, refresh } = useResource(loader);

  return { data, loading, error, refresh };
}
