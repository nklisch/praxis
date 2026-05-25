import type { CourseId, Logger } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope, requireUnlocked } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for course authoring operations.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.author.updateCourse
 *   praxis.author.getCourseSummary
 */
export function registerAuthorCourseHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.author.updateCourse",
    handleEnvelope(
      "praxis.author.updateCourse",
      log,
      z.object({
        courseId: z.string().min(1, "courseId"),
        patch: z.object({
          title: z.string().optional(),
          subject: z.string().optional(),
          gradeLevel: z.string().optional(),
        }),
        reason: z.string().optional(),
      }),
      async (input) => {
        await requireUnlocked(services);
        return services.authoring.updateCourse({
          courseId: brandId<"CourseId">(input.courseId),
          patch: input.patch as Parameters<typeof services.authoring.updateCourse>[0]["patch"],
          ...(input.reason !== undefined && { reason: input.reason }),
        });
      },
    ),
  );

  handle(
    "praxis.author.getCourseSummary",
    handleEnvelope(
      "praxis.author.getCourseSummary",
      log,
      z.string().min(1, "courseId"),
      async (courseId) => {
        await requireUnlocked(services);
        return services.authoring.getCourseSummary(brandId<"CourseId">(courseId) as CourseId);
      },
    ),
  );
}
