import type { Logger } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for the pack import service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.packs.listAvailable  → available pack metadata
 *   praxis.packs.listImported   → imported pack metadata
 *   praxis.packs.import         → import a pack by id
 */
export function registerPacksHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.packs.listAvailable",
    wrapEnvelope("praxis.packs.listAvailable", log, async () =>
      services.packs.listAvailablePacks(),
    ),
  );

  handle(
    "praxis.packs.listImported",
    wrapEnvelope("praxis.packs.listImported", log, async () => services.packs.listImportedPacks()),
  );

  handle(
    "praxis.packs.import",
    handleEnvelope("praxis.packs.import", log, z.string().min(1, "packId"), async (packId) =>
      services.packs.importPack(packId),
    ),
  );
}
