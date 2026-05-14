import { readdirSync } from "node:fs";
import path from "node:path";
import type { IpcStreamMessage } from "@praxis/client";
import { getOrCreateDefaultStudentId } from "@praxis/core/services";
import type { IngestionRequest, Logger } from "@praxis/core/types";
import { serializeErrorRedacted } from "@praxis/core/types";
import type { IngestorRegistry } from "@praxis/tools/runtime/ingestion";
import { dialog } from "electron";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * Recursively walk a directory and return all files whose extension is in
 * the registry's supported set.
 *
 * Safety rules:
 * - Depth cap of 5 levels below `root` (root itself is depth 0).
 * - Symlinks are never followed (detected via `Dirent.isSymbolicLink()`).
 * - Hidden files / directories (names starting with ".") are skipped.
 * - Unreadable subdirectories are silently skipped.
 */
export function walkDirectoryForIngest(root: string, registry: IngestorRegistry): string[] {
  const supported = new Set(registry.supportedExtensions().map((e) => e.toLowerCase()));
  const out: string[] = [];
  const DEPTH_CAP = 5;

  function visit(dir: string, depth: number): void {
    if (depth > DEPTH_CAP) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // permission denied / not a directory — skip silently
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // skip hidden
      if (entry.isSymbolicLink()) continue; // don't follow symlinks
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (supported.has(ext)) out.push(fullPath);
      }
    }
  }

  visit(root, 0);
  return out;
}

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

  // File picker (single-file, kept for back-compat with existing callers)
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

  // Multi-file / folder picker — returns string[] of absolute paths
  handle("praxis.ingest.pickPaths", async (_event, opts: { mode: "files" | "folder" }) => {
    const properties: Array<"openFile" | "multiSelections" | "openDirectory"> =
      opts.mode === "folder" ? ["openDirectory"] : ["openFile", "multiSelections"];

    const filters =
      opts.mode === "files"
        ? [
            {
              name: "Supported documents",
              extensions: ingestorRegistry.supportedExtensions(),
            },
            { name: "All Files", extensions: ["*"] },
          ]
        : undefined; // folder dialogs don't use extension filters

    const result = await dialog.showOpenDialog({
      title: opts.mode === "folder" ? "Open folder" : "Open documents",
      properties,
      ...(filters !== undefined && { filters }),
    });

    if (result.canceled || result.filePaths.length === 0) return [];

    if (opts.mode === "folder") {
      const root = result.filePaths[0];
      if (root === undefined) return [];
      return walkDirectoryForIngest(root, ingestorRegistry);
    }

    return result.filePaths;
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
          err: serializeErrorRedacted(err),
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
