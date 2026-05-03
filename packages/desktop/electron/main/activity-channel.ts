import type { IpcStreamMessage } from "@praxis/client";
import type { ActivityEvent, Logger } from "@praxis/core/types";
import { serializeError } from "@praxis/core/types";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * Streams activity events from `services.activity` to the renderer.
 *
 * Channel naming matches the project's streaming convention:
 *   praxis.activity.events.start  (invoke with streamId) — kicks off subscription
 *   praxis.activity.events.events.<streamId> (push)      — IpcStreamMessage<ActivityEvent>
 *   praxis.activity.events.cancel (on)                   — unsubscribes
 *
 * Also provides a single non-streaming endpoint:
 *   praxis.activity.dismiss (invoke) — drops a done/failed item early
 */
export function registerActivityHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  handle("praxis.activity.dismiss", async (_event, id: string) => {
    services.activity.dismiss(id);
  });

  handle("praxis.activity.events.start", async (_event, streamId: string) => {
    const streamLog = log.child({ component: "activity.events", streamId });
    const controller = new AbortController();
    activeAbortControllers.set(streamId, controller);
    const eventsChannel = `praxis.activity.events.events.${streamId}`;

    const push = (msg: IpcStreamMessage<ActivityEvent>) => {
      const wc = webContentsGetter();
      if (!wc || wc.isDestroyed()) return;
      wc.send(eventsChannel, msg);
    };

    streamLog.info("activity.subscribe");
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = services.activity.subscribe((event) => {
        if (controller.signal.aborted) return;
        push({ kind: "event", payload: event });
      });

      // Hold open until cancelled. We piggy-back on AbortController for that.
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener("abort", () => resolve(), { once: true });
      });

      push({ kind: "done" });
      streamLog.info("activity.unsubscribe");
    } catch (err) {
      streamLog.error("activity.error", { err: serializeError(err) });
      push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      unsubscribe?.();
      activeAbortControllers.delete(streamId);
    }
  });

  on("praxis.activity.events.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });
}
