import type { Logger, SubAgentEvent } from "@praxis/core/types";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { registerSubscriberStream } from "./stream-handler.js";

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

  handle(
    "praxis.subAgent.list",
    wrapEnvelope("praxis.subAgent.list", log, async () => services.subAgent.list()),
  );

  registerSubscriberStream<SubAgentEvent, [parentCallId?: string]>(
    { channelBase: "praxis.subAgent.events", log, webContentsGetter, activeAbortControllers },
    { handle, on },
    {
      subscribe: (cb, [parentCallId]) => {
        const filter = parentCallId !== undefined ? { parentCallId } : undefined;
        return services.subAgent.subscribe(cb, filter);
      },
    },
  );
}
