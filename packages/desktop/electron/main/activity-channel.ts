import type { ActivityEvent, Logger } from "@praxis/core/types";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { registerSubscriberStream } from "./stream-handler.js";

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

  handle(
    "praxis.activity.dismiss",
    wrapEnvelope("praxis.activity.dismiss", log, async (_event: unknown, id: string) => {
      services.activity.dismiss(id);
    }),
  );

  registerSubscriberStream<ActivityEvent>(
    { channelBase: "praxis.activity.events", log, webContentsGetter, activeAbortControllers },
    { handle, on },
    { subscribe: (cb) => services.activity.subscribe(cb) },
  );
}
