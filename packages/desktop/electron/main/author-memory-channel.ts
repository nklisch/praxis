import type { ConceptId, Logger, MisconceptionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

/**
 * IPC handlers for memory authoring operations.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.author.resetConcept
 *   praxis.author.clearMisconception
 *   praxis.author.exportMemory
 *   praxis.author.deleteAllMemory
 */
export function registerAuthorMemoryHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  handle(
    "praxis.author.resetConcept",
    handleEnvelope(
      "praxis.author.resetConcept",
      log,
      z.object({
        conceptId: z.string().min(1, "conceptId"),
        reason: z.string().min(1, "reason"),
      }),
      async (input) => {
        await requireUnlocked();
        const studentId = getStudentId(services);
        return services.authoring.resetConcept({
          studentId,
          conceptId: brandId<"ConceptId">(input.conceptId) as ConceptId,
          reason: input.reason,
        });
      },
    ),
  );

  handle(
    "praxis.author.clearMisconception",
    handleEnvelope(
      "praxis.author.clearMisconception",
      log,
      z.object({
        misconceptionId: z.string().min(1, "misconceptionId"),
        reason: z.string().min(1, "reason"),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.clearMisconception({
          misconceptionId: brandId<"MisconceptionId">(input.misconceptionId) as MisconceptionId,
          reason: input.reason,
        });
      },
    ),
  );

  handle(
    "praxis.author.exportMemory",
    handleEnvelope(
      "praxis.author.exportMemory",
      log,
      z.object({ targetPath: z.string().min(1, "targetPath") }),
      async (input) => {
        await requireUnlocked();
        const studentId = getStudentId(services);
        return services.authoring.exportMemory({ studentId, targetPath: input.targetPath });
      },
    ),
  );

  handle(
    "praxis.author.deleteAllMemory",
    handleEnvelope(
      "praxis.author.deleteAllMemory",
      log,
      z.object({
        reason: z.string().min(1, "reason"),
        confirm: z.literal(true),
      }),
      async (input) => {
        await requireUnlocked();
        const studentId = getStudentId(services);
        return services.authoring.deleteAllMemory({
          studentId,
          reason: input.reason,
          confirm: input.confirm,
        });
      },
    ),
  );
}
