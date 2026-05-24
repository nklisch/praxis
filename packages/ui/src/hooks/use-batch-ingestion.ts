import { useCallback, useRef } from "react";
import type { BatchResult, IngestionState, PendingFile } from "./use-ingestion.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseBatchIngestionResult {
  /** Core batch driver — called by the facade's startPickBatch / startBatchWithPaths. */
  startBatch: (paths: string[]) => Promise<void>;
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
  skipCurrentFile: () => void;
  cancelBatch: () => void;
  /** Reset all batch refs before a new run starts (called by the facade). */
  resetRefs: () => void;
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Sub-hook that owns the batch queue loop, partial-result accumulation,
 * and per-file tier-selection / skip / cancel coordination.
 *
 * @param setState - stable `setState` from the parent `useIngestion` facade;
 *   the batch loop drives shared IngestionState transitions.
 * @param ingestOneWithResult - stable callback from `useIngestion`'s
 *   `useCallback`; used for non-PDF files and inside `confirmTier`.
 * @param getState - stable ref-getter returning the current `IngestionState`;
 *   used by `skipCurrentFile` to read the file metadata without a stale closure.
 */
export function useBatchIngestion(
  setState: React.Dispatch<React.SetStateAction<IngestionState>>,
  ingestOneWithResult: (file: PendingFile, preferIngestorId?: string) => Promise<BatchResult>,
  getState: () => IngestionState,
): UseBatchIngestionResult {
  /**
   * When a batch is running and the current file needs tier selection, this ref
   * holds the deferred resolvers so confirmTier / the skip button can signal the
   * batch loop to advance.
   *
   * resolve() → user confirmed; ingestion ran before resolution (or will run
   *              after — the loop awaits this promise then reads tierResultRef)
   * The skip outcome is written into tierResultRef before resolving.
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

  // ── resetRefs ────────────────────────────────────────────────────────────────

  const resetRefs = useCallback(() => {
    cancelRequestedRef.current = false;
    tierDeferredRef.current = null;
    tierResultRef.current = null;
  }, []);

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
      }
    },
    [ingestOneWithResult],
  );

  // ── skipCurrentFile ──────────────────────────────────────────────────────────

  const skipCurrentFile = useCallback(() => {
    const deferred = tierDeferredRef.current;
    if (!deferred) return; // no-op outside a batch tier selection

    // Use the getState getter to read current state without a stale closure.
    const currentState = getState();
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
  }, [getState]);

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

  // ── startBatch ───────────────────────────────────────────────────────────────

  /**
   * Core batch runner: given a list of file paths, runs them through the
   * tier-selection + ingestion pipeline. Callers are responsible for resetting
   * refs and setting initial state before calling this.
   */
  const startBatch = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;

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
    },
    [ingestOneWithResult, setState],
  );

  return {
    startBatch,
    confirmTier,
    skipCurrentFile,
    cancelBatch,
    resetRefs,
  };
}
