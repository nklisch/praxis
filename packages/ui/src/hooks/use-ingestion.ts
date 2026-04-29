import type { IngestionEvent } from "@praxis/core/types";
import { useCallback, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export type IngestionState =
  | { status: "idle" }
  | { status: "picking" }
  | { status: "tier_selection"; filePath: string; filename: string; mimeType: string }
  | {
      status: "ingesting";
      filename: string;
      events: IngestionEvent[];
      chunksProcessed: number;
      totalChunks: number;
    }
  | { status: "done"; documentId: string; chunkCount: number }
  | { status: "error"; message: string };

export interface UseIngestionResult {
  state: IngestionState;
  startPick: () => Promise<void>;
  confirmTier: (
    filePath: string,
    filename: string,
    mimeType: string,
    preferIngestorId?: string,
  ) => Promise<void>;
  dismiss: () => void;
}

function mimeTypeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    epub: "application/epub+zip",
    html: "text/html",
    htm: "text/html",
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}

/**
 * State-machine hook for the ingestion flow:
 * idle → picking → [tier_selection for PDFs] → ingesting → done/error
 */
export function useIngestion(onDone?: () => void): UseIngestionResult {
  const client = usePraxisClient();
  const [state, setState] = useState<IngestionState>({ status: "idle" });

  const runIngestion = useCallback(
    async (
      filePath: string,
      filename: string,
      mimeType: string,
      preferIngestorId?: string,
    ): Promise<void> => {
      setState({
        status: "ingesting",
        filename,
        events: [],
        chunksProcessed: 0,
        totalChunks: 0,
      });

      try {
        const req = {
          filePath,
          filename,
          mimeType,
          studentId: "default", // resolved server-side by main process
          ...(preferIngestorId !== undefined && { preferIngestorId }),
        };

        for await (const event of client.ingest.start(req)) {
          if (event.type === "done") {
            setState({
              status: "done",
              documentId: event.documentId,
              chunkCount: event.chunkCount,
            });
            onDone?.();
            return;
          }
          if (event.type === "error") {
            setState({ status: "error", message: event.error.message });
            return;
          }
          // Update progress
          setState((prev) => {
            if (prev.status !== "ingesting") return prev;
            const chunksProcessed =
              event.type === "indexing" ? event.chunksProcessed : prev.chunksProcessed;
            const totalChunks = event.type === "indexing" ? event.totalChunks : prev.totalChunks;
            return {
              ...prev,
              events: [...prev.events, event],
              chunksProcessed,
              totalChunks,
            };
          });
        }
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    },
    [client, onDone],
  );

  const startPick = useCallback(async () => {
    setState({ status: "picking" });
    try {
      const filePath = await client.ingest.pickFile();
      if (!filePath) {
        setState({ status: "idle" });
        return;
      }

      const filename = filePath.split(/[\\/]/).pop() ?? filePath;
      const mimeType = mimeTypeFromPath(filePath);

      // For PDFs: show tier selection modal
      if (mimeType === "application/pdf") {
        setState({ status: "tier_selection", filePath, filename, mimeType });
        return;
      }

      // For other formats: start ingestion immediately
      await runIngestion(filePath, filename, mimeType, undefined);
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [client, runIngestion]);

  const confirmTier = useCallback(
    async (filePath: string, filename: string, mimeType: string, preferIngestorId?: string) => {
      await runIngestion(filePath, filename, mimeType, preferIngestorId);
    },
    [runIngestion],
  );

  const dismiss = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { state, startPick, confirmTier, dismiss };
}
