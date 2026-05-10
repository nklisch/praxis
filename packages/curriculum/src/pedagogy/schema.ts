import { z } from "zod";

// Citation — matches existing TS interface in @praxis/core/types/common.ts exactly.
// NOTE: the story body's unit 2 sketch showed a {source,url,authors,year} shape;
// the existing Citation type wins: {source, locator?, text?}.
export const CitationSchema = z.object({
  source: z.string().min(1),
  locator: z
    .object({
      page: z.number().int().optional(),
      section: z.string().optional(),
      timestamp: z.number().optional(),
    })
    .optional(),
  text: z.string().optional(),
});

export const TeachingStrategySchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "strategy id must be lowercase kebab-case"),
  name: z.string().min(1),
  description: z.string().min(1),
  applicability: z.object({
    conceptKinds: z.array(z.string()).default([]),
    bloomsLevels: z.array(z.string()).default([]),
    cognitiveLoad: z.enum(["low", "medium", "high"]),
  }),
  promptFragment: z.string().min(1),
  citations: z.array(CitationSchema).default([]),
});

export const TechniqueLessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  practicePromptIds: z.array(z.string()).default([]),
});

export const StudyTechniqueSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "technique id must be lowercase kebab-case"),
  name: z.string().min(1),
  description: z.string().min(1),
  uiAffordances: z.array(z.string()).default([]),
  curriculum: z.object({
    lessons: z.array(TechniqueLessonSchema),
  }),
  citations: z.array(CitationSchema).default([]),
});

export const MetacognitivePromptSchema = z.object({
  id: z.string().min(1),
  trigger: z.enum(["pre-reading", "post-reading", "pre-quiz", "post-error", "session-end"]),
  template: z.string().min(1),
});

export const PedagogyManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  praxisCompatible: z.string().min(1),
  publishedAt: z.number().int(),
  authors: z.array(z.string()).min(1, "manifest.authors must have at least one author"),
});

export const PedagogyPackSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver"),
    /** Reserved — see feature design note on deferred signing. v1 stores "v1-unsigned". */
    signature: z.string(),
    manifest: PedagogyManifestSchema,
    strategies: z.array(TeachingStrategySchema).default([]),
    studyTechniques: z.array(StudyTechniqueSchema).default([]),
    metacognitivePrompts: z.array(MetacognitivePromptSchema).default([]),
  })
  .superRefine((pack, ctx) => {
    // Uniqueness: strategy ids.
    const strategyIds = new Set<string>();
    for (const s of pack.strategies) {
      if (strategyIds.has(s.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["strategies"],
          message: `duplicate strategy id: ${s.id}`,
        });
      }
      strategyIds.add(s.id);
    }

    // Uniqueness: technique ids.
    const techniqueIds = new Set<string>();
    for (const t of pack.studyTechniques) {
      if (techniqueIds.has(t.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["studyTechniques"],
          message: `duplicate technique id: ${t.id}`,
        });
      }
      techniqueIds.add(t.id);
    }

    // Uniqueness: metacognitive prompt ids.
    const promptIds = new Set<string>();
    for (const p of pack.metacognitivePrompts) {
      if (promptIds.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["metacognitivePrompts"],
          message: `duplicate prompt id: ${p.id}`,
        });
      }
      promptIds.add(p.id);
    }
  });

export type PedagogyPackInput = z.input<typeof PedagogyPackSchema>;
export type PedagogyPackOutput = z.output<typeof PedagogyPackSchema>;
