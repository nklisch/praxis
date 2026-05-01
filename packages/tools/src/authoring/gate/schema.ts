/**
 * Shared Zod schemas for gate-authoring tools. Mirrors `GateTarget` and
 * `SuccessCriteria` from @praxis/core/types/artifacts. Co-located here so
 * gate.create and gate.edit stay in lockstep.
 */
import { z } from "zod";

export const GateTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("concept"),
    conceptId: z.string().min(1).describe("Concept ID this gate guards."),
  }),
  z.object({
    kind: z.literal("lesson"),
    lessonId: z.string().min(1).describe("Lesson ID this gate guards."),
  }),
  z.object({
    kind: z.literal("topic"),
    topicId: z.string().min(1).describe("Topic ID this gate guards."),
  }),
  z.object({
    kind: z.literal("course-completion"),
  }),
]);

/**
 * Structural mirror of `SuccessCriteria` without branded id types. Zod cannot
 * produce branded ids at parse-time; the schema validates *shape*, and the
 * handler casts the validated result to `SuccessCriteria` at the domain
 * boundary. The `z.ZodType` annotation provides the recursion hint TypeScript
 * needs to infer the `and`/`or` variants.
 */
type SuccessCriteriaInput =
  | { kind: "mastery-threshold"; conceptIds: string[]; minScore: number }
  | { kind: "exam-pass"; assignmentId: string; minScore: number }
  | { kind: "and"; criteria: SuccessCriteriaInput[] }
  | { kind: "or"; criteria: SuccessCriteriaInput[] };

// SuccessCriteria is recursive (and/or contain arrays of SuccessCriteria),
// so we need z.lazy + an explicit z.ZodType annotation to give TypeScript
// the recursion hint. Using the unbranded `SuccessCriteriaInput` as the
// annotation target — branded id promotion happens at the handler boundary.
export const SuccessCriteriaSchema: z.ZodType<SuccessCriteriaInput> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("mastery-threshold"),
      conceptIds: z.array(z.string().min(1)),
      minScore: z.number().min(0).max(1),
    }),
    z.object({
      kind: z.literal("exam-pass"),
      assignmentId: z.string().min(1),
      minScore: z.number().min(0).max(1),
    }),
    z.object({
      kind: z.literal("and"),
      criteria: z.array(SuccessCriteriaSchema),
    }),
    z.object({
      kind: z.literal("or"),
      criteria: z.array(SuccessCriteriaSchema),
    }),
  ]),
);
