import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
  title: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  gradeLevel: z.string().min(1).optional(),
  thresholds: z
    .object({
      conceptMastery: z.number().min(0).max(1).optional(),
      examPass: z.number().min(0).max(1).optional(),
      allowRetake: z.boolean().optional(),
      decayDays: z.number().int().positive().optional(),
    })
    .optional(),
});

const OutputSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

export const draftSetMetadataTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_set_metadata",
  description:
    "Update the draft's title, subject, gradeLevel, or mastery thresholds. All fields are optional — only supplied fields are updated.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) return { ok: false as const, reason: "no draftId in args or session context" };
    const result = await ctx.services.bootstrap.setMetadata({
      draftId,
      ...(args.title !== undefined && { title: args.title }),
      ...(args.subject !== undefined && { subject: args.subject }),
      ...(args.gradeLevel !== undefined && { gradeLevel: args.gradeLevel }),
      ...(args.thresholds !== undefined && {
        thresholds: Object.fromEntries(
          Object.entries(args.thresholds).filter(([, v]) => v !== undefined),
        ) as Partial<import("@praxis/core/types").ThresholdConfig>,
      }),
    });
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, reason: result.reason ?? "unknown error" };
  },
};
