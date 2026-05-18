import type { Logger, QuickCheckAnswer, QuickCheckEvent } from "@praxis/core/types";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { registerSubscriberStream } from "./stream-handler.js";

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

  registerSubscriberStream<QuickCheckEvent>(
    { channelBase: "praxis.quickCheck.events", log, webContentsGetter, activeAbortControllers },
    { handle, on },
    { subscribe: (cb) => quickCheck.subscribe(cb) },
  );

  handle(
    "praxis.quickCheck.resolve",
    wrapEnvelope(
      "praxis.quickCheck.resolve",
      log,
      async (_event: unknown, input: { callId: string; answer: QuickCheckAnswer }) => {
        quickCheck.resolve({ callId: input.callId, answer: input.answer });
      },
    ),
  );
}
