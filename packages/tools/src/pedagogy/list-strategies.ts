/**
 * pedagogy.list_strategies — list all teaching strategies in the active pack.
 *
 * Citations are stripped from the wire shape; they are an authoring concern
 * and not needed by the model in its response payload.
 */
import type { ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({});

const StrategyWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  applicability: z.object({
    conceptKinds: z.array(z.string()),
    bloomsLevels: z.array(z.string()),
    cognitiveLoad: z.enum(["low", "medium", "high"]),
  }),
  promptFragment: z.string(),
});

const OutputSchema = z.object({
  strategies: z.array(StrategyWireSchema),
});

export const pedagogyListStrategiesTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: "pedagogy.list_strategies",
  description:
    "List all teaching strategies in the active pedagogy pack. Returns id, name, description, applicability metadata, and the prompt fragment for each strategy. Returns an empty array when no pack is loaded.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: [],
  async handler(_args, ctx) {
    const strategies = ctx.services.pedagogyPack.listStrategies();
    return {
      strategies: strategies.map((s) => ({
        id: s.id as string,
        name: s.name,
        description: s.description,
        applicability: s.applicability,
        promptFragment: s.promptFragment,
      })),
    };
  },
};
