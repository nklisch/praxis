import type { IpcStreamMessage } from "@praxis/client";
import type { Logger, SubAgentEvent } from "@praxis/core/types";
import { serializeErrorRedacted } from "@praxis/core/types";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * Streams sub-agent transparency events from `services.subAgent` to the renderer.
 *
 * Channel naming matches the project's streaming convention:
 *   praxis.subAgent.events.start  (invoke with streamId + optional parentCallId)
 *   praxis.subAgent.events.events.<streamId> (push) — IpcStreamMessage<SubAgentEvent>
 *   praxis.subAgent.events.cancel (on) — unsubscribes
 *
 * Also provides a non-streaming list endpoint:
 *   praxis.subAgent.list (invoke) — returns readonly SubAgentItem[]
 */
export function registerSubAgentHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  handle("praxis.subAgent.list", async (): Promise<ReturnType<Services["subAgent"]["list"]>> => {
    return services.subAgent.list();
  });

  handle(
    "praxis.subAgent.events.start",
    async (_event, streamId: string, parentCallId?: string) => {
      const streamLog = log.child({ component: "subagent.events", streamId, parentCallId });
      const controller = new AbortController();
      activeAbortControllers.set(streamId, controller);
      const eventsChannel = `praxis.subAgent.events.events.${streamId}`;

      const push = (msg: IpcStreamMessage<SubAgentEvent>) => {
        const wc = webContentsGetter();
        if (!wc || wc.isDestroyed()) return;
        wc.send(eventsChannel, msg);
      };

      streamLog.info("subagent.subscribe");
      let unsubscribe: (() => void) | null = null;
      try {
        const filter = parentCallId !== undefined ? { parentCallId } : undefined;
        unsubscribe = services.subAgent.subscribe((event) => {
          if (controller.signal.aborted) return;
          push({ kind: "event", payload: event });
        }, filter);

        // Hold open until cancelled.
        await new Promise<void>((resolve) => {
          controller.signal.addEventListener("abort", () => resolve(), { once: true });
        });

        push({ kind: "done" });
        streamLog.info("subagent.unsubscribe");
      } catch (err) {
        streamLog.error("subagent.error", { err: serializeErrorRedacted(err) });
        push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        unsubscribe?.();
        activeAbortControllers.delete(streamId);
      }
    },
  );

  on("praxis.subAgent.events.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });
}
