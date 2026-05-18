import type { Logger, SessionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

/**
 * IPC handlers for the library search service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.library.search  → LibrarySearchResult[]
 */

const librarySearchSchema = z
  .object({
    query: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
    orphan: z.boolean().optional(),
    dueOnly: z.boolean().optional(),
    recentWindowMs: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
  })
  .optional();

export function registerLibraryHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.library.search",
    handleEnvelope("praxis.library.search", log, librarySearchSchema, async (input) => {
      const studentId = getStudentId(services);
      return services.library.search({
        studentId,
        ...(input?.query !== undefined && { query: input.query }),
        ...(input?.sessionId !== undefined && {
          sessionId: brandId<"SessionId">(input.sessionId) as SessionId,
        }),
        ...(input?.orphan !== undefined && { orphan: input.orphan }),
        ...(input?.dueOnly !== undefined && { dueOnly: input.dueOnly }),
        ...(input?.recentWindowMs !== undefined && { recentWindowMs: input.recentWindowMs }),
        ...(input?.limit !== undefined && { limit: input.limit }),
      });
    }),
  );
}
