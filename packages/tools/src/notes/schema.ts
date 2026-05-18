/**
 * Shared Zod schema for NoteBody — reused by create, update, and from-session-summary tools.
 * This is the runtime validation counterpart to the TypeScript NoteBody type.
 */

import { z } from "zod";

// OutlineNodeSchema is recursive; requires z.lazy.
// biome-ignore lint/suspicious/noExplicitAny: recursive type inference limitation
const OutlineNodeSchema: z.ZodType<{ text: string; children: any[] }> = z.lazy(() =>
  z.object({
    text: z.string(),
    children: z.array(OutlineNodeSchema),
  }),
);

export { OutlineNodeSchema };

/** Flat outline row (new keyboard-first editor). */
const OutlineRowSchema = z.object({
  id: z.string(),
  text: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  isCheckbox: z.boolean().optional(),
  checked: z.boolean().optional(),
});

export const NoteBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cornell"),
    questions: z.array(z.string()),
    details: z.array(z.string()),
    summary: z.string(),
  }),
  z.object({
    kind: z.literal("feynman"),
    explanation: z.string().min(1),
    followUps: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("outline"),
    rows: z.array(OutlineRowSchema).optional(),
    root: z.lazy(() => OutlineNodeSchema).optional(),
  }),
  z.object({
    kind: z.literal("free"),
    text: z.string(),
  }),
]);
