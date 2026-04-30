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
    root: OutlineNodeSchema,
  }),
  z.object({
    kind: z.literal("free"),
    text: z.string(),
  }),
]);
