import type { DraftEditOp, ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

// Zod schema for DraftEditOp — mirrors the TypeScript discriminated union.
const DraftEditOpSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rename-course"),
    title: z.string().min(1),
  }),
  z.object({
    kind: z.literal("rename-lesson"),
    lessonIndex: z.number().int().nonnegative(),
    title: z.string().min(1),
  }),
  z.object({
    kind: z.literal("reorder-lessons"),
    newOrder: z.array(z.number().int().nonnegative()),
  }),
  z.object({
    kind: z.literal("remove-lesson"),
    lessonIndex: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("add-lesson"),
    afterIndex: z.number().int(), // -1 to prepend
    title: z.string().min(1),
    conceptNames: z.array(z.string()).min(1),
  }),
  z.object({
    kind: z.literal("rename-concept"),
    conceptName: z.string(),
    newName: z.string().min(1),
  }),
  z.object({
    kind: z.literal("remove-concept"),
    conceptName: z.string(),
  }),
  z.object({
    kind: z.literal("add-concept"),
    lessonIndex: z.number().int().nonnegative(),
    name: z.string().min(1),
    description: z.string(),
    afterConceptIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("set-thresholds"),
    thresholds: z.object({
      conceptMastery: z.number().min(0).max(1),
      examPass: z.number().min(0).max(1),
      allowRetake: z.boolean(),
      decayDays: z.number().int().positive(),
    }),
  }),
  z.object({
    kind: z.literal("relink-concept"),
    conceptName: z.string().min(1),
    /** Destination lesson index. -1 to orphan (remove from all lessons without deleting node/edges). */
    lessonIndex: z.number().int().min(-1),
    /** Insert position in destination lesson. Inserts at afterConceptIndex+1, or end if absent. */
    afterConceptIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("add-edge"),
    fromName: z.string().min(1),
    toName: z.string().min(1),
    /** Edge strength in [0, 1]. */
    strength: z.number().min(0).max(1),
    rationale: z.string().optional(),
  }),
  z.object({
    kind: z.literal("remove-unit"),
    /** The draftUnitId of the unit to remove. */
    draftUnitId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("validate-draft"),
  }),
]);

const InputSchema = z.object({
  draftId: z.string().describe("The draft ID to edit."),
  op: DraftEditOpSchema.describe("The edit operation to apply."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  draftId: z.string(),
  summary: z.object({
    title: z.string(),
    lessonCount: z.number().int(),
    conceptCount: z.number().int(),
  }),
  warnings: z.array(z.string()).optional(),
});

export const editDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.edit_draft",
  description: `Apply an edit operation to an in-memory course draft. Operations:
- rename-course: change the course title
- rename-lesson / reorder-lessons / remove-lesson / add-lesson: lesson sequence edits
- rename-concept / remove-concept / add-concept / relink-concept: concept-graph edits
- add-edge: add a prerequisite edge between two existing concepts
- remove-unit: remove a unit (cascades lesson membership removal)
- set-thresholds: change mastery / exam-pass thresholds
- validate-draft: validate the current draft and surface issues as warnings
After each edit, call course.show_draft to display the new state.
The response includes an optional warnings[] array with informational signals (e.g. duplicate concept, cascaded removals).`,
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"], // in-memory only; no DB writes
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const { draft, warnings } = await ctx.services.bootstrap.editDraft({
      draftId: args.draftId,
      op: args.op as DraftEditOp,
    });
    return {
      ok: true,
      draftId: draft.draftId,
      summary: {
        title: draft.proposed.title,
        lessonCount: draft.proposed.proposedLessons.length,
        conceptCount: draft.proposed.proposedConcepts.length,
      },
      ...(warnings.length > 0 ? { warnings: [...warnings] } : {}),
    };
  },
};
