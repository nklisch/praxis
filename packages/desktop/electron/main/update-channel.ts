import type { Logger } from "@praxis/core/types";
import { app } from "electron";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for the update-check service.
 *
 * Channels:
 *   praxis.update.checkLatest  → latest release info (envelope-wrapped)
 */
export function registerUpdateHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.update.checkLatest",
    wrapEnvelope("praxis.update.checkLatest", log, async () => {
      return services.update.checkLatest(app.getVersion());
    }),
  );
}
