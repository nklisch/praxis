/**
 * pedagogy.get_strategy — look up a single teaching strategy by id.
 *
 * Returns the full strategy (minus citations) or `{ kind: "not_found" }` when
 * the id is unknown or no pack is loaded.
 */
import type { ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  id: z.string().min(1).describe("The strategy id to look up (e.g. 'worked-examples')."),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("strategy"),
    id: z.string(),
    name: z.string(),
    description: z.string(),
    applicability: z.object({
      conceptKinds: z.array(z.string()),
      bloomsLevels: z.array(z.string()),
      cognitiveLoad: z.enum(["low", "medium", "high"]),
    }),
    promptFragment: z.string(),
  }),
  z.object({
    kind: z.literal("not_found"),
    id: z.string(),
  }),
]);

export const pedagogyGetStrategyTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "pedagogy.get_strategy",
  description:
    "Look up a single teaching strategy by id. Returns the full strategy shape (minus citations) on success, or { kind: 'not_found' } when the id is unknown or no pack is loaded.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: [],
  async handler(args, ctx) {
    const strategy = ctx.services.pedagogyPack.getStrategy(
      args.id as import("@praxis/core/types").StrategyId,
    );
    if (!strategy) {
      return { kind: "not_found", id: args.id };
    }
    return {
      kind: "strategy",
      id: strategy.id as string,
      name: strategy.name,
      description: strategy.description,
      applicability: strategy.applicability,
      promptFragment: strategy.promptFragment,
    };
  },
};
