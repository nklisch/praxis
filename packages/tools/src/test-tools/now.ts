import type { ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

export const nowInput = z.object({}).describe("No arguments.");
export const nowOutput = z.object({
  iso: z.string(),
  epochMs: z.number(),
});

export const nowTool: ToolDefinition<typeof nowInput, typeof nowOutput> = {
  name: "test.now",
  description: "Returns the current server time in ISO 8601 and epoch ms.",
  input: nowInput,
  output: nowOutput,
  tier: "deterministic",
  effects: ["none"],
  async handler() {
    const epochMs = Date.now();
    return { iso: new Date(epochMs).toISOString(), epochMs };
  },
};
