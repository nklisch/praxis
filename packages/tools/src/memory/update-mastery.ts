import { applyDecay } from "@praxis/core/services";
import type { MasterySignalKind, ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId, MASTERY_SIGNAL_KINDS } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  conceptId: z.string().min(1).describe("The concept ID this signal is attributed to."),
  signal: z
    .enum(MASTERY_SIGNAL_KINDS as readonly [string, ...string[]])
    .describe(
      "Mastery signal kind: correct, incorrect, slip, hint_requested, timeout, exam_pass, exam_fail.",
    ),
  evidenceEventId: z
    .string()
    .optional()
    .describe("Episodic event ID this signal is derived from (leave empty if none)."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  conceptId: z.string(),
  newPKnown: z.number(),
  newEffectivePKnown: z.number(),
});

export const updateMasteryTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "update_mastery",
  description:
    "Emit an explicit mastery signal for a concept — use when grade_math / code_sandbox alone can't capture the quality of the student's response (e.g., a slip vs. genuine confusion). Tier: deterministic (pure BKT math). Pass evidenceEventId when you have a specific event to trace back to.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: ["memory.write"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const conceptId = brandId<"ConceptId">(args.conceptId);

    // Apply the signal via the memory service (single source of truth for BKT writes).
    ctx.services.memory.applySignal({
      studentId: ctx.studentId,
      conceptId,
      signals: [
        {
          conceptId,
          kind: args.signal as MasterySignalKind,
          evidenceEventIds: args.evidenceEventId ? [brandId<"EventId">(args.evidenceEventId)] : [],
        },
      ],
    });

    // Read the updated mastery row to return the new pKnown / effectivePKnown.
    const studentModel = await ctx.services.memory.studentModel(ctx.studentId);
    const mastery = studentModel.conceptMastery.get(conceptId);

    const newPKnown = mastery?.pKnown ?? 0;
    const newEffectivePKnown = mastery
      ? applyDecay({
          pKnown: mastery.pKnown,
          lastPracticedAt: mastery.lastPracticedAt,
          now: Date.now(),
          decayDays: 14,
        })
      : 0;

    return {
      ok: true,
      conceptId,
      newPKnown,
      newEffectivePKnown,
    };
  },
};
