/**
 * IPC channel for the per-course progress aggregator.
 *
 * Registers: praxis.progress.rollup
 *   Input:  {}  (empty; student resolved from services.getDefaultStudentId)
 *   Output: CourseProgressRollup[]  (one rollup per course, envelope-wrapped)
 *
 * Channel follows the `per-domain-channel-module` pattern:
 *   - One module per cohesive IPC domain.
 *   - Uses `handleEnvelope` for trust-boundary input validation.
 *   - Resolves the default student id from `services.getDefaultStudentId()`.
 */

import type { CourseProgressRollup, Logger } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

const rollupInputSchema = z.object({}).optional();

export function registerProgressHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.progress.rollup",
    handleEnvelope(
      "praxis.progress.rollup",
      log,
      rollupInputSchema,
      async (): Promise<CourseProgressRollup[]> => {
        const studentId = getStudentId(services);
        return services.progress.rollup({ studentId });
      },
    ),
  );
}
