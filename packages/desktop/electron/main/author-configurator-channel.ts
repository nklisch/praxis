import type { Logger } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
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

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

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
        await requireUnlocked();
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
        await requireUnlocked();
        return services.authoring.restoreAction({ actionId: input.actionId });
      },
    ),
  );
}
