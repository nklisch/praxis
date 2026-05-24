import type { ConceptId, LessonId, Logger } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for lesson authoring operations.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.author.createLesson
 *   praxis.author.updateLesson
 *   praxis.author.deleteLesson
 */
export function registerAuthorLessonHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  handle(
    "praxis.author.createLesson",
    handleEnvelope(
      "praxis.author.createLesson",
      log,
      z.object({
        courseId: z.string().min(1, "courseId"),
        title: z.string().min(1, "title"),
        conceptIds: z.array(z.string().min(1)),
        orderIndex: z.number().int().optional(),
        estimatedMinutes: z.number().int().positive().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.createLesson({
          courseId: brandId<"CourseId">(input.courseId),
          title: input.title,
          conceptIds: input.conceptIds.map((id) => brandId<"ConceptId">(id) as ConceptId),
          ...(input.orderIndex !== undefined && { orderIndex: input.orderIndex }),
          ...(input.estimatedMinutes !== undefined && { estimatedMinutes: input.estimatedMinutes }),
        });
      },
    ),
  );

  handle(
    "praxis.author.updateLesson",
    handleEnvelope(
      "praxis.author.updateLesson",
      log,
      z.object({
        lessonId: z.string().min(1, "lessonId"),
        patch: z.object({
          title: z.string().optional(),
          conceptIds: z.array(z.string().min(1)).optional(),
          estimatedMinutes: z.number().int().positive().optional(),
        }),
      }),
      async (input) => {
        await requireUnlocked();
        const patch: {
          title?: string;
          conceptIds?: ConceptId[];
          estimatedMinutes?: number;
        } = {};
        if (input.patch.title !== undefined) patch.title = input.patch.title;
        if (input.patch.conceptIds !== undefined) {
          patch.conceptIds = input.patch.conceptIds.map(
            (id) => brandId<"ConceptId">(id) as ConceptId,
          );
        }
        if (input.patch.estimatedMinutes !== undefined)
          patch.estimatedMinutes = input.patch.estimatedMinutes;
        return services.authoring.updateLesson({
          lessonId: brandId<"LessonId">(input.lessonId) as LessonId,
          patch,
        });
      },
    ),
  );

  handle(
    "praxis.author.deleteLesson",
    handleEnvelope(
      "praxis.author.deleteLesson",
      log,
      z.object({
        lessonId: z.string().min(1, "lessonId"),
        reason: z.string().optional(),
      }),
      async (input) => {
        await requireUnlocked();
        return services.authoring.deleteLesson({
          lessonId: brandId<"LessonId">(input.lessonId) as LessonId,
          ...(input.reason !== undefined && { reason: input.reason }),
        });
      },
    ),
  );
}
