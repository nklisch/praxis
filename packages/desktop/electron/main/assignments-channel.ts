import type { AssignmentId, CourseId, Logger } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for the assignments service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.assignments.get
 *   praxis.assignments.list
 *   praxis.assignments.recordResponse
 *   praxis.assignments.getResponses
 *   praxis.assignments.submit
 */
export function registerAssignmentsHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  const assignmentInputSchema = z.object({ assignmentId: z.string().min(1, "assignmentId") });

  handle(
    "praxis.assignments.get",
    handleEnvelope("praxis.assignments.get", log, assignmentInputSchema, async ({ assignmentId }) =>
      services.assignments.get({
        assignmentId: brandId<"AssignmentId">(assignmentId) as AssignmentId,
      }),
    ),
  );

  const assignmentListSchema = z.object({
    courseId: z.string().min(1, "courseId"),
    kind: z.enum(["quiz", "homework", "exam"]).optional(),
  });

  handle(
    "praxis.assignments.list",
    handleEnvelope("praxis.assignments.list", log, assignmentListSchema, async (input) =>
      services.assignments.list({
        courseId: brandId<"CourseId">(input.courseId) as CourseId,
        ...(input.kind !== undefined && { kind: input.kind }),
      }),
    ),
  );

  const recordResponseSchema = z.object({
    assignmentId: z.string().min(1, "assignmentId"),
    itemId: z.string().min(1, "itemId"),
    response: z.string(),
    work: z.string().optional(),
    sketchId: z.string().optional(),
    confidence: z.enum(["guessed", "unsure", "pretty_sure", "certain"]).optional(),
  });

  handle(
    "praxis.assignments.recordResponse",
    handleEnvelope("praxis.assignments.recordResponse", log, recordResponseSchema, async (input) =>
      services.assignments.recordResponse({
        assignmentId: brandId<"AssignmentId">(input.assignmentId) as AssignmentId,
        itemId: input.itemId,
        response: input.response,
        ...(input.work !== undefined && { work: input.work }),
        ...(input.sketchId !== undefined && { sketchId: input.sketchId }),
        ...(input.confidence !== undefined && { confidence: input.confidence }),
      }),
    ),
  );

  handle(
    "praxis.assignments.getResponses",
    handleEnvelope(
      "praxis.assignments.getResponses",
      log,
      assignmentInputSchema,
      async ({ assignmentId }) =>
        services.assignments.getResponses({
          assignmentId: brandId<"AssignmentId">(assignmentId) as AssignmentId,
        }),
    ),
  );

  handle(
    "praxis.assignments.submit",
    handleEnvelope(
      "praxis.assignments.submit",
      log,
      assignmentInputSchema,
      async ({ assignmentId }) =>
        services.assignments.submit({
          assignmentId: brandId<"AssignmentId">(assignmentId) as AssignmentId,
        }),
    ),
  );
}
