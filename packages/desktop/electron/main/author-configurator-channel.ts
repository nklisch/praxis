import type { Logger } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope, requireUnlocked } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for configurator action authoring operations.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.author.listConfiguratorActions
 *   praxis.author.restoreAction
 */
export function registerAuthorConfiguratorHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.author.listConfiguratorActions",
    handleEnvelope(
      "praxis.author.listConfiguratorActions",
      log,
      z
        .object({
          fromTs: z.number().optional(),
          limit: z.number().int().positive().optional(),
        })
        .optional(),
      async (input) => {
        await requireUnlocked(services);
        return services.authoring.listConfiguratorActions(
          input !== undefined
            ? {
                ...(input.fromTs !== undefined && {
                  fromTs: input.fromTs as import("@praxis/core/types").Timestamp,
                }),
                ...(input.limit !== undefined && { limit: input.limit }),
              }
            : undefined,
        );
      },
    ),
  );

  handle(
    "praxis.author.restoreAction",
    handleEnvelope(
      "praxis.author.restoreAction",
      log,
      z.object({ actionId: z.string().min(1, "actionId is required") }),
      async (input) => {
        await requireUnlocked(services);
        return services.authoring.restoreAction({ actionId: input.actionId });
      },
    ),
  );
}
