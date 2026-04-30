import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  targetPath: z
    .string()
    .min(1)
    .describe(
      "Absolute file path to write the memory export JSON. Example: '/Users/me/praxis-memory-export.json'.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  bytesWritten: z.number().describe("Bytes written to the file."),
  targetPath: z.string(),
});

export const memoryExportTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "memory.export",
  description:
    "Export the student's full memory snapshot (mastery, misconceptions, episodic events) to a JSON file at the given path. Per SPEC.md: students own their memory. Logged to audit trail.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const result = await ctx.services.authoring.exportMemory({
      studentId: ctx.studentId,
      targetPath: args.targetPath,
    });
    return { ok: true, bytesWritten: result.bytesWritten, targetPath: args.targetPath };
  },
};
