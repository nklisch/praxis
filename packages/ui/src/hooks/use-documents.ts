import type { DocumentSummary } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseDocumentsResult {
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
}

/**
 * Hook that loads and manages the list of ingested documents.
 * Triggers a refresh after ingestion completes (caller should call refresh()).
 */
export function useDocuments(): UseDocumentsResult {
  const client = usePraxisClient();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await client.documents.list();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  const deleteDocument = useCallback(
    async (documentId: string) => {
      await client.documents.delete(documentId);
      setDocuments((prev) => prev.filter((d) => d.documentId !== documentId));
    },
    [client],
  );

  // Load on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { documents, loading, error, refresh, deleteDocument };
}
