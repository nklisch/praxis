import type { ConceptId, Logger, StudentId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for the flashcards service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.flashcards.create
 *   praxis.flashcards.update
 *   praxis.flashcards.get
 *   praxis.flashcards.list
 *   praxis.flashcards.delete
 *   praxis.flashcards.review
 *   praxis.flashcards.dueCount
 */
export function registerFlashcardsHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  const flashcardIdSchema = z.string().min(1, "flashcardId");

  const flashcardCreateSchema = z.object({
    front: z.string().min(1, "front"),
    back: z.string().min(1, "back"),
    conceptId: z.string().optional(),
    source: z
      .object({
        kind: z.enum(["authored", "extracted", "user-created"]),
        ref: z.string(),
      })
      .optional(),
  });

  handle(
    "praxis.flashcards.create",
    handleEnvelope("praxis.flashcards.create", log, flashcardCreateSchema, async (input) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.flashcards.create({
        studentId,
        front: input.front,
        back: input.back,
        ...(input.conceptId !== undefined && {
          conceptId: brandId<"ConceptId">(input.conceptId) as ConceptId,
        }),
        ...(input.source !== undefined && { source: input.source }),
      });
    }),
  );

  const flashcardUpdateSchema = z.object({
    flashcardId: z.string().min(1, "flashcardId"),
    patch: z.object({
      front: z.string().optional(),
      back: z.string().optional(),
      conceptId: z.string().optional(),
    }),
  });

  handle(
    "praxis.flashcards.update",
    handleEnvelope("praxis.flashcards.update", log, flashcardUpdateSchema, async (input) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.flashcards.update({
        studentId,
        flashcardId: brandId<"FlashcardId">(input.flashcardId),
        patch: {
          ...(input.patch.front !== undefined && { front: input.patch.front }),
          ...(input.patch.back !== undefined && { back: input.patch.back }),
          ...(input.patch.conceptId !== undefined && {
            conceptId: brandId<"ConceptId">(input.patch.conceptId) as ConceptId,
          }),
        },
      });
    }),
  );

  handle(
    "praxis.flashcards.get",
    handleEnvelope("praxis.flashcards.get", log, flashcardIdSchema, async (flashcardId) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.flashcards.get({
        studentId,
        flashcardId: brandId<"FlashcardId">(flashcardId),
      });
    }),
  );

  const flashcardListSchema = z
    .object({
      conceptId: z.string().optional(),
      due: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
    })
    .optional();

  handle(
    "praxis.flashcards.list",
    handleEnvelope("praxis.flashcards.list", log, flashcardListSchema, async (input) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.flashcards.list({
        studentId,
        ...(input?.conceptId !== undefined && {
          conceptId: brandId<"ConceptId">(input.conceptId) as ConceptId,
        }),
        ...(input?.due !== undefined && { due: input.due }),
        ...(input?.limit !== undefined && { limit: input.limit }),
      });
    }),
  );

  handle(
    "praxis.flashcards.delete",
    handleEnvelope("praxis.flashcards.delete", log, flashcardIdSchema, async (flashcardId) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.flashcards.delete({
        studentId,
        flashcardId: brandId<"FlashcardId">(flashcardId),
      });
    }),
  );

  const flashcardReviewSchema = z.object({
    flashcardId: z.string().min(1, "flashcardId"),
    rating: z.enum(["again", "hard", "good", "easy"]),
  });

  handle(
    "praxis.flashcards.review",
    handleEnvelope("praxis.flashcards.review", log, flashcardReviewSchema, async (input) => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.flashcards.review({
        studentId,
        flashcardId: brandId<"FlashcardId">(input.flashcardId),
        rating: input.rating,
      });
    }),
  );

  handle(
    "praxis.flashcards.dueCount",
    wrapEnvelope("praxis.flashcards.dueCount", log, async () => {
      const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
      return services.flashcards.dueCount({ studentId });
    }),
  );
}
