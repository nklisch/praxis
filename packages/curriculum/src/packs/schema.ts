import { z } from "zod";

export const PackConceptSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/, "concept id must be kebab-case dotted"),
  name: z.string().min(1),
  description: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  standardsTags: z.array(z.string()).default([]),
});

export const PackEdgeSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  strength: z.number().min(0).max(1),
});

export const PackManifestSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "pack id must be lowercase kebab-case"),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver"),
    name: z.string().min(1),
    subject: z.string().min(1),
    gradeLevel: z.string().min(1),
    standardsRef: z.object({ body: z.string(), version: z.string() }).optional(),
    authoredBy: z.string().min(1),
    authoredAt: z.string().datetime(),
    concepts: z.array(PackConceptSchema).min(1),
    edges: z.array(PackEdgeSchema).default([]),
  })
  .superRefine((manifest, ctx) => {
    const conceptIds = new Set(manifest.concepts.map((c) => c.id));

    // Cross-validate: every edge endpoint must reference a known concept id.
    for (const e of manifest.edges) {
      if (!conceptIds.has(e.fromId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges"],
          message: `edge fromId references unknown concept: ${e.fromId}`,
        });
      }
      if (!conceptIds.has(e.toId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges"],
          message: `edge toId references unknown concept: ${e.toId}`,
        });
      }
      if (e.fromId === e.toId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges"],
          message: `self-loop detected on concept: ${e.fromId}`,
        });
      }
    }

    // Cycle detection: DFS with white/gray/black coloring.
    const cycles = detectCycles(
      manifest.concepts.map((c) => c.id),
      manifest.edges,
    );
    for (const cycle of cycles) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges"],
        message: `circular prerequisite chain detected: ${cycle.join(" → ")}`,
      });
    }
  });

/**
 * Detect cycles in a directed graph using DFS with 3-color marking.
 * Returns an array of cycles, where each cycle is the sequence of node ids.
 * Stops after the first cycle found per connected component (sufficient for validation).
 */
function detectCycles(
  nodeIds: string[],
  edges: Array<{ fromId: string; toId: string }>,
): string[][] {
  // Build adjacency list: fromId → [toId, ...]
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    const neighbors = adj.get(e.fromId);
    if (neighbors) neighbors.push(e.toId);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, 0 | 1 | 2>();
  const parent = new Map<string, string | null>();
  const cycles: string[][] = [];

  for (const id of nodeIds) color.set(id, WHITE);

  function dfs(u: string, stack: string[]): void {
    color.set(u, GRAY);
    stack.push(u);

    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        // Found a back edge — extract the cycle.
        const cycleStart = stack.indexOf(v);
        if (cycleStart !== -1) {
          cycles.push([...stack.slice(cycleStart), v]);
        }
        return; // Report one cycle per traversal
      }
      if (color.get(v) === WHITE) {
        parent.set(v, u);
        dfs(v, stack);
        if (cycles.length > 0) return; // Propagate early exit
      }
    }

    stack.pop();
    color.set(u, BLACK);
  }

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) {
      dfs(id, []);
      if (cycles.length > 0) break; // One cycle report is enough
    }
  }

  // Suppress unused variable warning
  void parent;

  return cycles;
}

/** Inferred TypeScript type — single source of truth from the Zod schema. */
export type PackManifestInput = z.input<typeof PackManifestSchema>;
export type PackManifestOutput = z.output<typeof PackManifestSchema>;
