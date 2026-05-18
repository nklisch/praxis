/**
 * IPC channel for the Workbench recommendation engine.
 *
 * Registers: praxis.recommendations.next
 *   Input:  { limit?: number }  (optional; defaults to 5 in the service)
 *   Output: Recommendation[]    (priority-ordered, envelope-wrapped)
 *
 * Channel follows the `per-domain-channel-module` pattern:
 *   - One module per cohesive IPC domain.
 *   - Uses `handleEnvelope` for trust-boundary input validation.
 *   - Resolves the default student id from `services.getDefaultStudentId()`.
 */

import type { Logger, Recommendation } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

const nextInputSchema = z.object({ limit: z.number().int().positive().optional() }).optional();

export function registerRecommendationsHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.recommendations.next",
    handleEnvelope(
      "praxis.recommendations.next",
      log,
      nextInputSchema,
      async (input): Promise<Recommendation[]> => {
        const studentId = getStudentId(services);
        return services.recommendations.next({
          studentId,
          ...(input?.limit !== undefined && { limit: input.limit }),
        });
      },
    ),
  );
}
