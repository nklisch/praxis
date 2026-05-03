import type { SketchId, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

export const sketchReadInput = z.object({
  sketchId: z
    .string()
    .describe("The sketch id from a [sketch:<id>] marker in the student's message."),
});

export const sketchReadOutput = z.object({
  snapshotJson: z.string().describe("The tldraw snapshot as a JSON string."),
  imageBase64: z.string().describe("PNG bytes, base64-encoded."),
  width: z.number(),
  height: z.number(),
});

export const sketchReadTool: ToolDefinition<typeof sketchReadInput, typeof sketchReadOutput> = {
  name: "sketch.read",
  description:
    "Fetch a sketch the student has drawn. Use when the student's message contains a [sketch:<id>] marker, or when grading work that references a sketch. Returns the snapshot JSON and a base64-encoded PNG image of the drawing.",
  tier: "deterministic",
  effects: ["none"],
  input: sketchReadInput,
  output: sketchReadOutput,
  async handler(input, ctx) {
    if (!ctx.services.sketches) {
      throw new Error("Sketch service is not available in this context.");
    }
    const sketch = await ctx.services.sketches.get(input.sketchId as SketchId);
    return {
      snapshotJson: JSON.stringify(sketch.snapshot),
      imageBase64: sketch.image.toString("base64"),
      width: sketch.width,
      height: sketch.height,
    };
  },
};
