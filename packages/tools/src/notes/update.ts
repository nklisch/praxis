import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { NoteBodySchema } from "./schema.js";

const InputSchema = z.object({
  noteId: z.string().describe("The ID of the note to update."),
  body: NoteBodySchema.describe(
    "The new body. Must match the note's existing format (you cannot change format on update).",
  ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  noteId: z.string(),
});

export const updateNoteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "note.update",
  description:
    "Update the body of an existing note. The body kind must match the note's existing format — format changes are not allowed. Use note.show to retrieve the current body before editing.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const note = await ctx.services.notes.update({
      studentId: ctx.studentId,
      noteId: brandId<"NoteId">(args.noteId),
      // biome-ignore lint/suspicious/noExplicitAny: NoteBody discriminated union passthrough
      body: args.body as any,
    });
    return { ok: true, noteId: note.id };
  },
};
