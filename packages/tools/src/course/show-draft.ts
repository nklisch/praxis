import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  draftId: z
    .string()
    .describe("The draft ID returned by course.start_exploration or course.draft_init."),
});

// The draft payload is rendered as a structured card by the UI; use z.any() for
// the nested ProposedCourse shape to avoid duplicating the type here.
const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    draft: z.any(),
  }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("expired") }),
]);

export const showDraftTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.show_draft",
  description:
    "Return the current state of a draft course. The student's UI renders this as a structured card so they can scan the proposal. Use this after course.start_exploration to display the draft, after each course.edit_draft to re-display, and before course.confirm_draft to verify.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const draft = await ctx.services.bootstrap.showDraft(args.draftId);
    if (!draft) {
      // We can't distinguish "never existed" from "expired" from the showDraft return.
      // Return not_found for both; the message says "expired or not found".
      return { kind: "not_found" };
    }
    return { kind: "ok", draft };
  },
};
