import type { ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

export const echoInput = z.object({
  text: z.string().describe("The text to echo back."),
});
export const echoOutput = z.object({
  echoed: z.string(),
});

export const echoTool: ToolDefinition<typeof echoInput, typeof echoOutput> = {
  name: "test.echo",
  description:
    "Returns the input text wrapped in `{echoed}`. Used for engine conformance testing only.",
  input: echoInput,
  output: echoOutput,
  tier: "deterministic",
  effects: ["none"],
  async handler({ text }) {
    return { echoed: text };
  },
};
