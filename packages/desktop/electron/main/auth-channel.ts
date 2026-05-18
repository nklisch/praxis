import type { IpcStreamMessage } from "@praxis/client";
import type { Logger } from "@praxis/core/types";
import { redactSecrets, serializeErrorRedacted } from "@praxis/core/types";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for Claude authentication.
 *
 * Channels:
 *   praxis.auth.claude.status           (invoke) → ClaudeAuthStatus
 *   praxis.auth.claude.login.start      (invoke) — streaming login flow
 *   praxis.auth.claude.login.events.<streamId>  (push) — IpcStreamMessage<unknown>
 *   praxis.auth.claude.login.cancel     (on)    — abort in-flight login
 */
export function registerAuthHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  handle(
    "praxis.auth.claude.status",
    wrapEnvelope("praxis.auth.claude.status", log, async () => services.claudeAuth.status()),
  );

  // Streaming login flow. Renderer subscribes to events.<streamId> first,
  // then invokes start. Cancel via .cancel with the streamId.
  handle("praxis.auth.claude.login.start", async (_event, streamId: string) => {
    const streamLog = log.child({ component: "auth.claude.login", streamId });
    const controller = new AbortController();
    activeAbortControllers.set(streamId, controller);
    const eventsChannel = `praxis.auth.claude.login.events.${streamId}`;
    const t0 = performance.now();
    let eventCount = 0;

    const push = (msg: IpcStreamMessage<unknown>) => {
      const wc = webContentsGetter();
      if (!wc || wc.isDestroyed()) return;
      wc.send(eventsChannel, msg);
    };

    streamLog.info("auth.claude.login.start");
    try {
      const stream = services.claudeAuth.login({ signal: controller.signal });
      for await (const event of stream) {
        if (controller.signal.aborted) break;
        eventCount++;
        push({ kind: "event", payload: event });
      }
      push({ kind: "done" });
      streamLog.info("auth.claude.login.done", {
        durationMs: Math.round(performance.now() - t0),
        eventCount,
      });
    } catch (err) {
      streamLog.error("auth.claude.login.error", {
        durationMs: Math.round(performance.now() - t0),
        eventCount,
        err: serializeErrorRedacted(err),
      });
      push({
        kind: "error",
        error: redactSecrets(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      activeAbortControllers.delete(streamId);
    }
  });

  on("praxis.auth.claude.login.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });
}
