import type { IpcStreamMessage } from "@praxis/client";
import type { CourseId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { ipcMain } from "electron";
import type { Services } from "./services.js";

/**
 * Register all IPC handlers for the Praxis services.
 *
 * Stream channel naming convention (matches IpcTransport in @praxis/client):
 *   invoke:  praxis.session.send.start  (with streamId as first arg)
 *   events:  praxis.session.send.events.<streamId>
 *   cancel:  praxis.session.send.cancel
 */
export function registerIpcHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
): () => void {
  const handlers: Array<{ channel: string; handler: Parameters<typeof ipcMain.handle>[1] }> = [];
  const activeAbortControllers = new Map<string, AbortController>();

  function handle(channel: string, fn: Parameters<typeof ipcMain.handle>[1]) {
    ipcMain.handle(channel, fn);
    handlers.push({ channel, handler: fn });
  }

  // ── Session ──────────────────────────────────────────────────────────────

  handle("praxis.session.active", async () => {
    return services.session.active();
  });

  handle("praxis.session.start", async (_event, opts: { modeId: string; courseId?: string }) => {
    return services.session.start({
      modeId: opts.modeId,
      ...(opts.courseId !== undefined && {
        courseId: brandId<"CourseId">(opts.courseId) as CourseId,
      }),
    });
  });

  handle("praxis.session.end", async (_event, sessionId: string) => {
    // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
    return services.session.end(sessionId as any);
  });

  // Streaming: client invokes `praxis.session.send.start` with streamId + args.
  // Server pushes IpcStreamMessage<EngineEvent> on `praxis.session.send.events.<streamId>`.
  // Client can cancel via `praxis.session.send.cancel` with the streamId.
  handle(
    "praxis.session.send.start",
    async (_event, streamId: string, sessionId: string, message: string) => {
      const controller = new AbortController();
      activeAbortControllers.set(streamId, controller);
      const eventsChannel = `praxis.session.send.events.${streamId}`;

      const push = (msg: IpcStreamMessage<unknown>) => {
        const wc = webContentsGetter();
        if (!wc || wc.isDestroyed()) return;
        wc.send(eventsChannel, msg);
      };

      try {
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        const stream = services.session.send(sessionId as any, message);
        for await (const event of stream) {
          if (controller.signal.aborted) break;
          push({ kind: "event", payload: event });
        }
        push({ kind: "done" });
      } catch (err) {
        push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        activeAbortControllers.delete(streamId);
      }
    },
  );

  ipcMain.on("praxis.session.send.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });

  // ── Config ───────────────────────────────────────────────────────────────

  handle("praxis.config.isLocked", async () => {
    return services.config.isLocked();
  });

  handle("praxis.config.setLockCode", async (_event, code: string) => {
    return services.config.setLockCode(code);
  });

  handle("praxis.config.unlock", async (_event, code: string) => {
    return services.config.unlock(code);
  });

  handle("praxis.config.selectedEngine", async () => {
    return services.config.selectedEngine();
  });

  handle("praxis.config.setSelectedEngine", async (_event, engineId: string) => {
    return services.config.setSelectedEngine(engineId);
  });

  handle("praxis.config.engineConfig", async () => {
    return services.config.engineConfig();
  });

  handle("praxis.config.setEngineConfig", async (_event, config: unknown) => {
    // biome-ignore lint/suspicious/noExplicitAny: config shape validated inside service
    return services.config.setEngineConfig(config as any);
  });

  // Return unregister function.
  return () => {
    for (const { channel } of handlers) {
      ipcMain.removeHandler(channel);
    }
    ipcMain.removeAllListeners("praxis.session.send.cancel");
    for (const ctrl of activeAbortControllers.values()) {
      ctrl.abort();
    }
    activeAbortControllers.clear();
  };
}
