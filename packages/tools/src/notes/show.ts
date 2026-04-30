import { brandId } from "@praxis/core/types";
import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  noteId: z.string().describe("The ID of the note to display."),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok"), note: z.unknown() }),
  z.object({ kind: z.literal("not_found") }),
]);

export const showNoteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "note.show",
  description:
    "Display a note inline in chat. The student's UI renders the note's structured body (Cornell columns, Feynman prose, Outline tree, or Free text). Use this when the student asks you to show a previous note.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const note = await ctx.services.notes.get({
      studentId: ctx.studentId,
      noteId: brandId<"NoteId">(args.noteId),
    });
    if (!note) return { kind: "not_found" as const };
    return { kind: "ok" as const, note };
  },
};
