import type { IpcStreamMessage } from "@praxis/client";
import type { Logger, QuickCheckAnswer, QuickCheckEvent } from "@praxis/core/types";
import { redactSecrets, serializeErrorRedacted } from "@praxis/core/types";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC channel for the Phase 17 QuickCheck human-in-the-loop dispatch.
 *
 * Channel naming follows the project's streaming convention:
 *   praxis.quickCheck.events.start  (invoke with streamId) — subscribe to events
 *   praxis.quickCheck.events.events.<streamId> (push)      — IpcStreamMessage<QuickCheckEvent>
 *   praxis.quickCheck.events.cancel (on streamId)          — unsubscribe
 *   praxis.quickCheck.resolve       (invoke with { callId, answer }) — resolve a pending check
 */
export function registerQuickCheckHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const quickCheck = services.quickCheck;
  const { handle, on } = createIpcHelpers(log);

  handle("praxis.quickCheck.events.start", async (_event, streamId: string) => {
    const streamLog = log.child({ component: "quickCheck.events", streamId });
    const controller = new AbortController();
    activeAbortControllers.set(streamId, controller);
    const eventsChannel = `praxis.quickCheck.events.events.${streamId}`;

    const push = (msg: IpcStreamMessage<QuickCheckEvent>) => {
      const wc = webContentsGetter();
      if (!wc || wc.isDestroyed()) return;
      wc.send(eventsChannel, msg);
    };

    streamLog.info("quickCheck.events.subscribe");
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = quickCheck.subscribe((event) => {
        if (controller.signal.aborted) return;
        push({ kind: "event", payload: event });
      });

      // Hold open until cancelled.
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener("abort", () => resolve(), { once: true });
      });

      push({ kind: "done" });
      streamLog.info("quickCheck.events.unsubscribe");
    } catch (err) {
      streamLog.error("quickCheck.events.error", { err: serializeErrorRedacted(err) });
      push({
        kind: "error",
        error: redactSecrets(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      unsubscribe?.();
      activeAbortControllers.delete(streamId);
    }
  });

  on("praxis.quickCheck.events.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });

  handle(
    "praxis.quickCheck.resolve",
    async (_event, input: { callId: string; answer: QuickCheckAnswer }) => {
      quickCheck.resolve({ callId: input.callId, answer: input.answer });
    },
  );
}
