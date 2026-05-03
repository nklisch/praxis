/**
 * Prompt and Zod schema for the ConceptMapDivergenceIndexer one-shot agent.
 */

import { z } from "zod";

export const DIVERGENCE_SYSTEM_PROMPT = `You are reviewing a student's concept map versus the canonical concept graph for this course.

Your task: identify meaningful divergences — places where the student's map meaningfully differs from the canonical graph in a way worth discussing.

Focus on productive disagreements:
- Missing prerequisite connections between concepts the student has drawn
- Extra connections that contradict the canonical graph (e.g., wrong direction of dependency)
- Mislabeled direction (student drew A→B but the canonical graph shows B→A)
- Concepts from the canonical graph that are entirely absent from the student's map

Tone: Prefer "consider connecting X and Y" over "you missed X". Skip trivial or cosmetic differences.

Output a JSON object (in a \`\`\`json fence) with this shape:

{
  "divergences": [
    {
      "kind": "<one of: missing-edge, extra-edge, mislabeled-direction, missing-concept>",
      "description": "<one sentence describing the divergence, written constructively>",
      "elementIds": ["<student-side tldraw shape id, if applicable>"]
    }
  ]
}

Rules:
- Maximum 5 divergences per response. Prioritize the most pedagogically significant ones.
- If the student's map is broadly correct or has no significant divergences, return: { "divergences": [] }
- \`elementIds\` should contain the student's tldraw shape id(s) involved, or [] for missing-concept divergences.
- Do not include any prose outside the JSON fence.`;

/** Zod schema for the LLM output. Capped at 5 divergences. */
export const DivergenceOutputSchema = z.object({
  divergences: z
    .array(
      z.object({
        kind: z.enum(["missing-edge", "extra-edge", "mislabeled-direction", "missing-concept"]),
        description: z.string().min(1),
        elementIds: z.array(z.string()),
      }),
    )
    .max(5),
});

export type DivergenceOutput = z.infer<typeof DivergenceOutputSchema>;
