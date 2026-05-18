import type { Logger } from "@praxis/core/types";
import { isAllowedExternalUrl } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for Electron shell helpers.
 *
 * Channels:
 *   praxis.shell.openExternal  → void (envelope-wrapped, URL validated)
 */
export function registerShellHandlers(_services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.shell.openExternal",
    handleEnvelope(
      "praxis.shell.openExternal",
      log,
      z.string().min(1, "url").refine(isAllowedExternalUrl, "url must be http(s)"),
      async (url) => {
        const { shell } = await import("electron");
        await shell.openExternal(url);
      },
    ),
  );
}
