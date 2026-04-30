import type { AssignmentItem, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { AssignmentItemSchema } from "./item-schema.js";

const InputSchema = z.object({
  courseId: z.string().describe("The course this assignment belongs to."),
  kind: z.enum(["quiz", "homework", "exam"]),
  title: z.string().min(1),
  items: z.array(AssignmentItemSchema).min(1),
  conceptIds: z.array(z.string()),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  assignmentId: z.string(),
  itemCount: z.number().int().positive(),
});

export const createAssignmentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "assignment.create",
  description: `Author a new assignment (quiz, homework, or exam) for the active course. Provide a title, list of items, and the conceptIds the assignment covers. Items must include grader-specific fields per kind:
- multiple-choice: options[] + correctOptionIndex
- short-answer: acceptedAnswers[] + acceptedAnswerMatch ("exact" | "substring" | "normalized")
- math: expectedSolution { variable, value }
- code: language ("javascript" | "python") + testCases[]
- free-response: rubric (REQUIRED for exam mode; quiz/homework can fall back to acceptedAnswers)

Optional workRubric for partial credit on shown work (math/code items only):

Add a workRubric ONLY when the item rewards process — multi-step problems where the steps reveal understanding (algebra word problems, geometry proofs, physics derivations, code where structure matters). Skip workRubric for:
  - One-step recall items ("what is 2+3?", "factor x²+5x+6")
  - Multiple choice or short-answer (no work to show)
  - Items where the work IS the answer

By mode:
  - quiz: workRubric is rare. Items are short retrieval practice; partial credit slows the loop. Reserve for the 1-2 multi-step items per quiz where it adds real value.
  - homework: workRubric is common. Items are practice for depth; partial credit on shown reasoning is the point.
  - exam: workRubric is judgment-call per item. Set primaryWeight to reflect stakes — 1.0 (deterministic-only) for high-stakes items unless a pre-authored rubric warrants partial credit.

Rubrics use criteria with weights summing to 1.0 (validated). Each criterion has a description and an integer 0-10 score is produced by the rubric agent at grading time.`,
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    const { assignmentId } = await ctx.services.assignments.create({
      courseId: brandId<"CourseId">(args.courseId),
      studentId: ctx.studentId,
      kind: args.kind,
      title: args.title,
      // The items have already been validated by Zod at the tool boundary.
      items: args.items as unknown as AssignmentItem[],
      conceptIds: args.conceptIds.map((id) => brandId<"ConceptId">(id)),
      authoredBy: "tutor",
    });
    return { ok: true as const, assignmentId, itemCount: args.items.length };
  },
};
