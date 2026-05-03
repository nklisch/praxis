import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z.string().optional().describe("Draft id. If omitted, uses the session's active draft."),
});

const OutputSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    summary: z.object({
      draftId: z.string(),
      title: z.string(),
      lessonCount: z.number().int(),
      conceptCount: z.number().int(),
      edgeCount: z.number().int(),
      firstLessons: z.array(
        z.object({
          title: z.string(),
          conceptCount: z.number().int(),
        }),
      ),
      unitCount: z.number().int(),
      assessmentCount: z.number().int(),
    }),
  }),
  z.object({
    ok: z.literal(false),
    issues: z.array(
      z.object({
        kind: z.string(),
        message: z.string(),
      }),
    ),
  }),
]);

export const draftFinalizeTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_finalize",
  description:
    "Validate and freeze the draft. Returns a DraftSummary on success. On failure, returns issues[] — fix each issue and call draft_finalize again. At least one concept and one lesson are required; all lesson concept names must already exist.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext) {
    const draftId = args.draftId ?? ctx.draftId;
    if (!draftId) {
      return {
        ok: false as const,
        issues: [{ kind: "no_draft_id", message: "no draftId in args or session context" }],
      };
    }
    const result = await ctx.services.bootstrap.finalizeDraft({ draftId });
    if (result.ok) return { ok: true as const, summary: result.summary };
    return { ok: false as const, issues: Array.from(result.issues) };
  },
};
