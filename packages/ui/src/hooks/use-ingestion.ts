import type { DocumentScope } from "@praxis/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useBatchIngestion } from "./use-batch-ingestion.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PendingFile {
  filePath: string;
  filename: string;
  mimeType: string;
}

export interface BatchResult {
  filePath: string;
  filename: string;
  outcome: { ok: true; documentId: string; chunkCount: number } | { ok: false; message: string };
}

export type IngestionState =
  | { status: "idle" }
  | { status: "picking" }
  | {
      status: "tier_selection";
      filePath: string;
      filename: string;
      mimeType: string;
      /** Set when in a multi-file batch (provides "File N of M" context). */
      batch?: { current: number; total: number };
    }
  | {
      status: "ingesting";
      filename: string;
      /** Set when in a multi-file batch (provides "Ingesting file N of M" context). */
      batch?: { current: number; total: number };
    }
  | { status: "batch_summary"; results: BatchResult[] }
  | { status: "done"; documentId: string; chunkCount: number }
  | { status: "error"; message: string };

export interface UseIngestionResult {
  state: IngestionState;
  /** Multi-file or folder pick-and-ingest batch. */
  startPickBatch: (mode: "files" | "folder") => Promise<void>;
  /**
   * Ingest a list of file paths directly (bypassing the OS dialog). Useful
   * for drag-and-drop flows where paths come from Electron's File.path.
   * No-op when paths is empty.
   */
  startBatchWithPaths: (paths: string[]) => Promise<void>;
  /**
   * Called by PickerTierModal to confirm the ingestor tier and kick off
   * ingestion. Resolves the internal deferred so the batch loop can advance.
   */
  confirmTier: (
    filePath: string,
    filename: string,
    mimeType: string,
    preferIngestorId?: string,
  ) => Promise<void>;
  /**
   * Skip the current file in a batch (visible in the tier modal's "Skip this
   * file" button). Records the file as skipped and advances the batch loop.
   * No-op outside a batch.
   */
  skipCurrentFile: () => void;
  /** Reset to idle (e.g. after done / error / batch_summary). */
  dismiss: () => void;
  /** Abort the current file and discard remaining queue; transitions to batch_summary. */
  cancelBatch: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}

function errString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * State-machine hook for the ingestion flow.
 *
 * Single-file flow (unchanged):
 *   idle → picking → [tier_selection for PDFs] → ingesting → done/error
 *
 * Batch flow (new):
 *   idle → picking → (per file: [tier_selection?] → ingesting) → batch_summary
 *
 * @param onDone - optional callback fired after each individual successful
 *   ingestion (fires N times for a batch of N).
 * @param opts.scope - when set, each ingested document is auto-attached to
 *   this scope (the backend ingestion service handles the attachment).
 */
export function useIngestion(
  onDone?: () => void,
  opts?: { scope?: DocumentScope },
): UseIngestionResult {
  const client = usePraxisClient();
  const [state, setState] = useState<IngestionState>({ status: "idle" });

  // Mirror state into a ref so the sub-hook's skipCurrentFile can read current
  // state without a stale closure.
  const stateRef = useRef<IngestionState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ── Core ingestion runner ────────────────────────────────────────────────────

  /**
   * Run ingestion for a single file and return the BatchResult. Does NOT set
   * state — callers handle state transitions for batch context.
   */
  const ingestOneWithResult = useCallback(
    async (file: PendingFile, preferIngestorId?: string): Promise<BatchResult> => {
      try {
        const req = {
          filePath: file.filePath,
          filename: file.filename,
          mimeType: file.mimeType,
          studentId: "default", // resolved server-side by main process
          ...(preferIngestorId !== undefined && { preferIngestorId }),
          ...(opts?.scope !== undefined && { scope: opts.scope }),
        };

        for await (const event of client.ingest.start(req)) {
          if (event.type === "done") {
            onDone?.();
            return {
              filePath: file.filePath,
              filename: file.filename,
              outcome: { ok: true, documentId: event.documentId, chunkCount: event.chunkCount },
            };
          }
          if (event.type === "error") {
            return {
              filePath: file.filePath,
              filename: file.filename,
              outcome: { ok: false, message: event.error.message },
            };
          }
          // Progress events are surfaced through the StatusStrip via ActivityRegistry — no local state needed.
        }
        // Stream ended without a done/error event — treat as an error.
        return {
          filePath: file.filePath,
          filename: file.filename,
          outcome: { ok: false, message: "Ingestion stream ended unexpectedly" },
        };
      } catch (err) {
        return {
          filePath: file.filePath,
          filename: file.filename,
          outcome: { ok: false, message: errString(err) },
        };
      }
    },
    [client, onDone, opts?.scope],
  );

  // ── Batch sub-hook delegation ────────────────────────────────────────────────

  const batch = useBatchIngestion(setState, ingestOneWithResult, () => stateRef.current);

  // ── Facade entry points ──────────────────────────────────────────────────────

  const startPickBatch = useCallback(
    async (mode: "files" | "folder") => {
      batch.resetRefs();
      setState({ status: "picking" });
      try {
        const paths = await client.ingest.pickPaths({ mode });
        if (paths.length === 0) {
          setState({ status: "idle" });
          return;
        }
        await batch.startBatch(paths);
      } catch (err) {
        setState({ status: "error", message: errString(err) });
      }
    },
    [client, batch],
  );

  const startBatchWithPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      batch.resetRefs();
      try {
        await batch.startBatch(paths);
      } catch (err) {
        setState({ status: "error", message: errString(err) });
      }
    },
    [batch],
  );

  // ── dismiss ──────────────────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return {
    state,
    startPickBatch,
    startBatchWithPaths,
    confirmTier: batch.confirmTier,
    skipCurrentFile: batch.skipCurrentFile,
    dismiss,
    cancelBatch: batch.cancelBatch,
  };
}
