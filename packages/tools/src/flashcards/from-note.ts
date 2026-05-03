import type { NoteBody, OutlineNode, ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId, parseNoteBody } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  noteId: z.string().describe("The ID of the note to extract flashcards from."),
  sectionIndex: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "For Cornell notes: extract only this question/detail index (0-based). Omit to propose all pairs.",
    ),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  noteId: z.string(),
  proposed: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
    }),
  ),
});

export const fromNoteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "flashcard.from_note",
  description:
    "Propose flashcards extracted from a note's structured body. Cornell: each (questions[i], details[i]) pair becomes a card. Feynman: explanation→one card; each followUp→one card. Outline: each leaf node→one card (parent path as front). Free: returns empty array (no structure to extract from). Returns proposed cards; the UI prompts the student to confirm each before adding.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"], // proposal only — no writes
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const note = await ctx.services.notes.get({
      studentId: ctx.studentId,
      noteId: brandId<"NoteId">(args.noteId),
    });
    if (!note) throw new Error(`note not found: ${args.noteId}`);

    const body = parseNoteBody(note.format, note.body ?? null);
    const proposed = proposeFlashcardsFromBody(body, args.sectionIndex);

    return { ok: true, noteId: note.id, proposed };
  },
};

function proposeFlashcardsFromBody(
  body: NoteBody,
  sectionIndex?: number,
): Array<{ front: string; back: string }> {
  switch (body.kind) {
    case "cornell": {
      const cards: Array<{ front: string; back: string }> = [];
      const indices = sectionIndex !== undefined ? [sectionIndex] : body.questions.map((_, i) => i);
      for (const i of indices) {
        const q = body.questions[i]?.trim();
        const d = body.details[i]?.trim();
        if (q && d) cards.push({ front: q, back: d });
      }
      return cards;
    }
    case "feynman": {
      const cards: Array<{ front: string; back: string }> = [
        { front: "Explain in your own words.", back: body.explanation },
      ];
      for (const q of body.followUps) {
        cards.push({
          front: q,
          back: "(no answer authored — fill in during review)",
        });
      }
      return cards;
    }
    case "outline": {
      const out: Array<{ front: string; back: string }> = [];
      const walk = (node: OutlineNode, ancestors: string[]) => {
        if (node.children.length === 0) {
          // leaf — front is the ancestor path; back is the leaf text
          out.push({
            front: ancestors.join(" > ") || "(root)",
            back: node.text,
          });
        } else {
          for (const child of node.children) {
            walk(child, [...ancestors, node.text]);
          }
        }
      };
      walk(body.root, []);
      return out;
    }
    case "free": {
      // Cannot extract structure from free text.
      return [];
    }
    case "sketch": {
      // Sketch notes have no extractable text structure for flashcards.
      return [];
    }
    default: {
      const _exhaust: never = body;
      return [];
    }
  }
}
