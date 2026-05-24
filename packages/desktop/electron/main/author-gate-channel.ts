import type { CourseId, GateId, GateTarget, Logger, SuccessCriteria } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for gate authoring operations.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.author.createGate
 *   praxis.author.updateGate
 *   praxis.author.deleteGate
 *   praxis.author.overrideGate
 */
export function registerAuthorGateHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  handle(
    "praxis.author.createGate",
    handleEnvelope(
      "praxis.author.createGate",
      log,
      z.object({
        courseId: z.string().min(1, "courseId"),
        guards: z.unknown(),
        prerequisites: z.array(z.string().min(1)),
        successCriteria: z.unknown(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.createGate({
          courseId: brandId<"CourseId">(input.courseId) as CourseId,
          guards: input.guards as GateTarget,
          prerequisites: input.prerequisites.map((id) => brandId<"GateId">(id) as GateId),
          successCriteria: input.successCriteria as SuccessCriteria,
        });
      },
    ),
  );

  handle(
    "praxis.author.updateGate",
    handleEnvelope(
      "praxis.author.updateGate",
      log,
      z.object({
        gateId: z.string().min(1, "gateId"),
        patch: z.object({
          prerequisites: z.array(z.string().min(1)).optional(),
          successCriteria: z.unknown().optional(),
        }),
        reason: z.string().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        const patch: {
          prerequisites?: GateId[];
          successCriteria?: SuccessCriteria;
        } = {};
        if (input.patch.prerequisites !== undefined) {
          patch.prerequisites = input.patch.prerequisites.map(
            (id) => brandId<"GateId">(id) as GateId,
          );
        }
        if (input.patch.successCriteria !== undefined) {
          patch.successCriteria = input.patch.successCriteria as SuccessCriteria;
        }
        return services.authoring.updateGate({
          gateId: brandId<"GateId">(input.gateId) as GateId,
          patch,
          ...(input.reason !== undefined && { reason: input.reason }),
        });
      },
    ),
  );

  handle(
    "praxis.author.deleteGate",
    handleEnvelope(
      "praxis.author.deleteGate",
      log,
      z.object({
        gateId: z.string().min(1, "gateId"),
        reason: z.string().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.deleteGate({
          gateId: brandId<"GateId">(input.gateId) as GateId,
          ...(input.reason !== undefined && { reason: input.reason }),
        });
      },
    ),
  );

  handle(
    "praxis.author.overrideGate",
    handleEnvelope(
      "praxis.author.overrideGate",
      log,
      z.object({
        gateId: z.string().min(1, "gateId"),
        reason: z.string().min(1, "reason"),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.overrideGate({
          gateId: brandId<"GateId">(input.gateId) as GateId,
          reason: input.reason,
        });
      },
    ),
  );
}
