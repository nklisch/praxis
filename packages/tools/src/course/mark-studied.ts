import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { checkConceptNotLocked } from "../lock-helpers.js";

const InputSchema = z.object({
  conceptId: z.string().describe("The concept ID to mark as studied."),
  evidenceEventId: z
    .string()
    .optional()
    .describe(
      "Optional episodic event ID to link this studied marker to a specific turn for back-reference.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  conceptId: z.string(),
  lessonComplete: z.boolean(),
  lessonId: z.string().nullable(),
});

export const markStudiedTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.mark_studied",
  description:
    "Record that the student has covered a concept. Pass the evidence event ID if you'd like the marker traced to a specific turn. Returns lessonComplete=true when this concept was the last one in the current lesson.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const conceptId = brandId<"ConceptId">(args.conceptId);

    // Phase 9: Lock check. Sessions without a courseId skip this (backward compat).
    if (ctx.courseId) {
      const snapshot = await ctx.services.courseState.read({
        studentId: ctx.studentId,
        courseId: ctx.courseId,
      });
      if (snapshot) {
        const lockCheck = checkConceptNotLocked(snapshot, conceptId);
        if (!lockCheck.ok) {
          throw new Error(`cannot mark_studied "${args.conceptId}": ${lockCheck.reason}`);
        }
      }
    }

    const result = await ctx.services.artifacts.markConceptStudied({
      studentId: ctx.studentId,
      conceptId,
      ...(args.evidenceEventId !== undefined && { evidenceEventId: args.evidenceEventId }),
    });
    return {
      ok: true,
      conceptId,
      lessonComplete: result.lessonComplete,
      lessonId: result.lessonId,
    };
  },
};
