/**
 * pedagogy.get_technique — look up a single study technique by id.
 *
 * Returns the full technique including curriculum lessons, or
 * `{ kind: "not_found" }` when the id is unknown or no pack is loaded.
 * Citations are stripped from the wire shape.
 */
import type { ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  id: z.string().min(1).describe("The technique id to look up (e.g. 'spaced-repetition')."),
});

const TechniqueLessonWireSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  practicePromptIds: z.array(z.string()),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("technique"),
    id: z.string(),
    name: z.string(),
    description: z.string(),
    uiAffordances: z.array(z.string()),
    curriculum: z.object({
      lessons: z.array(TechniqueLessonWireSchema),
    }),
  }),
  z.object({
    kind: z.literal("not_found"),
    id: z.string(),
  }),
]);

export const pedagogyGetTechniqueTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "pedagogy.get_technique",
  description:
    "Look up a single study technique by id. Returns the full technique including curriculum lessons on success, or { kind: 'not_found' } when the id is unknown or no pack is loaded.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: [],
  async handler(args, ctx) {
    const technique = ctx.services.pedagogyPack.getTechnique(
      args.id as import("@praxis/core/types").TechniqueId,
    );
    if (!technique) {
      return { kind: "not_found", id: args.id };
    }
    return {
      kind: "technique",
      id: technique.id as string,
      name: technique.name,
      description: technique.description,
      uiAffordances: technique.uiAffordances,
      curriculum: {
        lessons: technique.curriculum.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          body: l.body,
          practicePromptIds: l.practicePromptIds,
        })),
      },
    };
  },
};
