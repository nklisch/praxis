import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  sessionId: z.string().describe("The session ID to summarize."),
  format: z
    .enum(["cornell", "feynman", "outline", "free"])
    .describe("Target note format for the generated note body."),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  noteId: z.string(),
});

export const fromSessionSummaryTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "note.from_session_summary",
  description:
    "Generate a structured note from the recent session's transcript. Calls a fresh one-shot LLM session that reads the last N turns of the session and produces a structured NoteBody per the requested format. Returns the new note's id; the student can edit afterward. Use at the end of a teaching session when the student wants a study artifact.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: ["artifact.mutate"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    // Delegate fully to NotesServiceImpl.fromSessionSummary — the tool handler is thin.
    const note = await ctx.services.notes.fromSessionSummary({
      studentId: ctx.studentId,
      sessionId: args.sessionId,
      format: args.format,
    });
    return { ok: true, noteId: note.id };
  },
};
