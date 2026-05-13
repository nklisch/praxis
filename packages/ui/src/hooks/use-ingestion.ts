import type { CourseId } from "@praxis/core/types";
import { useCallback, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

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
  /** Single-file pick-and-ingest (unchanged from pre-batch). */
  startPick: () => Promise<void>;
  /** Multi-file or folder pick-and-ingest batch. */
  startPickBatch: (mode: "files" | "folder") => Promise<void>;
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
 * @param opts.courseId - when set, each ingested document is auto-attached to
 *   this course (the backend ingestion service handles the attachment).
 */
export function useIngestion(
  onDone?: () => void,
  opts?: { courseId?: CourseId },
): UseIngestionResult {
  const client = usePraxisClient();
  const [state, setState] = useState<IngestionState>({ status: "idle" });

  /**
   * When a batch is running and the current file needs tier selection, this ref
   * holds the deferred resolvers so confirmTier / the skip button can signal the
   * batch loop to advance.
   *
   * resolve() → user confirmed; ingestion ran before resolution (or will run
   *              after — the loop awaits this promise then reads batchResultRef)
   * The skip outcome is written into batchResultRef before resolving.
   */
  const tierDeferredRef = useRef<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
    promise: Promise<void>;
  } | null>(null);

  /**
   * When a tier-selection deferred resolves, the result to append to the batch.
   * null means "run normal ingestion" (i.e., confirmTier was called).
   */
  const tierResultRef = useRef<BatchResult | null>(null);

  /**
   * Set to true by cancelBatch() so the batch loop knows to break after the
   * current file.
   */
  const cancelRequestedRef = useRef(false);

  /**
   * Batch-level cancel: resolves to partial results collected so far.
   */
  const batchCancelRef = useRef<{
    resolve: (partial: BatchResult[]) => void;
  } | null>(null);

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
          ...(opts?.courseId !== undefined && { courseId: opts.courseId }),
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
          // Progress events are reported via the ActivityRail — no local state needed.
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
    [client, onDone, opts?.courseId],
  );

  // ── runIngestion (used by single-file startPick path) ───────────────────────

  const runIngestion = useCallback(
    async (
      filePath: string,
      filename: string,
      mimeType: string,
      preferIngestorId?: string,
    ): Promise<void> => {
      setState({ status: "ingesting", filename });

      try {
        const req = {
          filePath,
          filename,
          mimeType,
          studentId: "default",
          ...(preferIngestorId !== undefined && { preferIngestorId }),
          ...(opts?.courseId !== undefined && { courseId: opts.courseId }),
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
        }
      } catch (err) {
        setState({ status: "error", message: errString(err) });
      }
    },
    [client, onDone, opts?.courseId],
  );

  // ── Single-file startPick (unchanged public API) ─────────────────────────────

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

      if (mimeType === "application/pdf") {
        setState({ status: "tier_selection", filePath, filename, mimeType });
        return;
      }

      await runIngestion(filePath, filename, mimeType, undefined);
    } catch (err) {
      setState({ status: "error", message: errString(err) });
    }
  }, [client, runIngestion]);

  // ── confirmTier ──────────────────────────────────────────────────────────────

  const confirmTier = useCallback(
    async (filePath: string, filename: string, mimeType: string, preferIngestorId?: string) => {
      const deferred = tierDeferredRef.current;
      if (deferred) {
        // Batch mode: run ingestion here then resolve the deferred so the loop
        // can advance. We write the result into tierResultRef first so the loop
        // picks it up after the await.
        const file: PendingFile = { filePath, filename, mimeType };
        const result = await ingestOneWithResult(file, preferIngestorId);
        tierResultRef.current = result;
        deferred.resolve();
      } else {
        // Single-file mode (legacy path).
        await runIngestion(filePath, filename, mimeType, preferIngestorId);
      }
    },
    [ingestOneWithResult, runIngestion],
  );

  // ── Batch loop ───────────────────────────────────────────────────────────────

  const startPickBatch = useCallback(
    async (mode: "files" | "folder") => {
      cancelRequestedRef.current = false;
      tierDeferredRef.current = null;
      tierResultRef.current = null;

      setState({ status: "picking" });
      try {
        const paths = await client.ingest.pickPaths({ mode });
        if (paths.length === 0) {
          setState({ status: "idle" });
          return;
        }

        const queue: PendingFile[] = paths.map((p) => {
          const filename = p.split(/[\\/]/).pop() ?? p;
          return { filePath: p, filename, mimeType: mimeTypeFromPath(p) };
        });

        const results: BatchResult[] = [];

        // Set up a cancel escape hatch: a promise that resolves with partial
        // results when cancelBatch() is called mid-loop.
        let cancelResolve!: (partial: BatchResult[]) => void;
        const cancelPromise = new Promise<BatchResult[]>((resolve) => {
          cancelResolve = resolve;
        });
        batchCancelRef.current = { resolve: cancelResolve };

        for (let i = 0; i < queue.length; i++) {
          if (cancelRequestedRef.current) break;

          const file = queue[i];
          if (!file) continue;
          const batch = { current: i + 1, total: queue.length };

          if (file.mimeType === "application/pdf") {
            // Show tier selection modal with batch context.
            setState({
              status: "tier_selection",
              filePath: file.filePath,
              filename: file.filename,
              mimeType: file.mimeType,
              batch,
            });

            // Create a deferred that confirmTier (or skip) will resolve.
            tierResultRef.current = null;
            const { promise, resolve, reject } = Promise.withResolvers<void>();
            tierDeferredRef.current = { promise, resolve, reject };

            // Race against cancel.
            await Promise.race([promise, cancelPromise]);

            // Clean up the deferred.
            tierDeferredRef.current = null;

            if (cancelRequestedRef.current) break;

            const tierResult = tierResultRef.current;
            if (tierResult !== null) {
              // confirmTier or skip produced a result directly.
              results.push(tierResult);
              tierResultRef.current = null;
              continue;
            }

            // Should not reach here in normal flow — treat as skip.
            results.push({
              filePath: file.filePath,
              filename: file.filename,
              outcome: { ok: false, message: "Tier selection cancelled" },
            });
          } else {
            // Non-PDF: ingest immediately.
            setState({ status: "ingesting", filename: file.filename, batch });
            const result = await ingestOneWithResult(file);
            results.push(result);
          }
        }

        batchCancelRef.current = null;

        // Transition to batch_summary with whatever results we have.
        setState({ status: "batch_summary", results });
      } catch (err) {
        setState({ status: "error", message: errString(err) });
      }
    },
    [client, ingestOneWithResult],
  );

  // ── skipCurrentFile ──────────────────────────────────────────────────────────

  const skipCurrentFile = useCallback(() => {
    const deferred = tierDeferredRef.current;
    if (!deferred) return; // no-op outside a batch tier selection

    // The current state holds the file's metadata; write a skip result so the
    // batch loop records it and advances.
    const currentState = state;
    if (currentState.status === "tier_selection") {
      tierResultRef.current = {
        filePath: currentState.filePath,
        filename: currentState.filename,
        outcome: { ok: false, message: "Skipped by user" },
      };
    } else {
      // Defensive: write a null so the loop treats it as "cancelled".
      tierResultRef.current = null;
    }
    deferred.resolve();
  }, [state]);

  // ── cancelBatch ──────────────────────────────────────────────────────────────

  const cancelBatch = useCallback(() => {
    cancelRequestedRef.current = true;

    // If a tier selection is in flight, resolve the deferred with a skip so the
    // loop unblocks and can check the cancel flag.
    const tierDeferred = tierDeferredRef.current;
    if (tierDeferred) {
      tierResultRef.current = null; // will be treated as "tier selection cancelled"
      tierDeferred.resolve();
    }

    // Trigger the cancel escape hatch with whatever results were collected.
    batchCancelRef.current?.resolve([]);
    batchCancelRef.current = null;
  }, []);

  // ── dismiss ──────────────────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { state, startPick, startPickBatch, confirmTier, skipCurrentFile, dismiss, cancelBatch };
}
