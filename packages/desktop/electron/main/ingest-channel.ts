import type { IpcStreamMessage } from "@praxis/client";
import { getOrCreateDefaultStudentId } from "@praxis/core/services";
import type { IngestionRequest, Logger } from "@praxis/core/types";
import { serializeError } from "@praxis/core/types";
import type { IngestorRegistry } from "@praxis/tools/runtime/ingestion";
import { dialog } from "electron";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * Register IPC handlers for the ingestion channel.
 *
 * Stream channel naming:
 *   praxis.ingest.start (invoke with streamId + req) → kicks off ingestion
 *   praxis.ingest.events.<streamId> (push)           → IpcStreamMessage<IngestionEvent>
 *   praxis.ingest.cancel (on)                        → aborts the stream
 *
 * Non-streamed:
 *   praxis.ingest.pickFile      → open native file picker
 *   praxis.ingest.isAvailable   → always { available: true }
 *   praxis.ingest.candidatesFor → { id, label }[] for file
 */
export function registerIngestHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  ingestorRegistry: IngestorRegistry,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  // File picker
  handle("praxis.ingest.pickFile", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open document",
      properties: ["openFile"],
      filters: [
        {
          name: "Supported documents",
          extensions: ["pdf", "docx", "epub", "html", "htm", "md", "markdown", "txt", "pptx"],
        },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });

  // Availability check — all Phase 5 ingestors are pure-JS; always available
  handle("praxis.ingest.isAvailable", async () => ({ available: true }));

  // Candidates for a given file — returns { id, label }[] for UI tier selection modal
  handle(
    "praxis.ingest.candidatesFor",
    async (_event, payload: { mimeType: string; filename: string }) => {
      const candidates = await ingestorRegistry.candidatesFor(payload);
      return candidates.map((c) => ({ id: c.id, label: c.label }));
    },
  );

  // Start ingestion stream
  handle(
    "praxis.ingest.start",
    async (_event, streamId: string, req: Omit<IngestionRequest, "studentId">) => {
      const streamLog = log.child({ component: "ingest", streamId });
      const controller = new AbortController();
      activeAbortControllers.set(streamId, controller);
      const eventsChannel = `praxis.ingest.events.${streamId}`;
      const t0 = performance.now();
      let eventCount = 0;

      const push = (msg: IpcStreamMessage<unknown>) => {
        const wc = webContentsGetter();
        if (!wc || wc.isDestroyed()) return;
        wc.send(eventsChannel, msg);
      };

      streamLog.info("ingest.start");
      try {
        const studentId = getOrCreateDefaultStudentId(
          // SessionServiceImpl holds the db in deps — access it via a known path
          (services.session as unknown as { deps: { db: import("@praxis/core/db").PraxisDb } }).deps
            .db,
        );

        const fullReq: IngestionRequest = { ...req, studentId };

        const stream = services.ingestion.ingest(fullReq, controller.signal);
        for await (const event of stream) {
          if (controller.signal.aborted) break;
          eventCount++;
          push({ kind: "event", payload: event });
        }
        push({ kind: "done" });
        streamLog.info("ingest.done", {
          durationMs: Math.round(performance.now() - t0),
          eventCount,
        });
      } catch (err) {
        streamLog.error("ingest.error", {
          durationMs: Math.round(performance.now() - t0),
          eventCount,
          err: serializeError(err),
        });
        push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        activeAbortControllers.delete(streamId);
      }
    },
  );

  on("praxis.ingest.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });
}
