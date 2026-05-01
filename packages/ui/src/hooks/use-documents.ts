import type { DocumentSummary } from "@praxis/core/types";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "./use-resource.js";

export interface UseDocumentsResult {
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
}

/**
 * Hook that loads and manages the list of ingested documents.
 * Uses useResource for loading/error/refresh state and mount-effect.
 * Triggers a refresh after ingestion completes (caller should call refresh()).
 */
export function useDocuments(): UseDocumentsResult {
  const client = usePraxisClient();

  const loader = useCallback(() => client.documents.list(), [client]);

  const { data: documents = [], loading, error, refresh, setData } = useResource(loader);

  const deleteDocument = useCallback(
    async (documentId: string) => {
      await client.documents.delete(documentId);
      setData((prev) => (prev ?? []).filter((d) => d.documentId !== documentId));
    },
    [client, setData],
  );

  return { documents, loading, error, refresh, deleteDocument };
}
