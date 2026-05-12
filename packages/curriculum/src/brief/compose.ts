import type { BriefContext, GenerationParams, Mode, PromptFragment } from "@praxis/core/types";

export interface ComposedBrief {
  systemPrompt: string;
  userMessage: string;
  context: BriefContext;
  generation?: GenerationParams;
  maxSteps?: number;
}

export interface ComposeBriefInput {
  mode: Mode;
  userMessage: string;
  context?: Partial<BriefContext>;
  /** Map of fragment ID → override text (from configure-mode customization). */
  overrides?: ReadonlyMap<string, string>;
  generation?: GenerationParams;
  maxSteps?: number;
}

export interface ComposeSystemPromptInput {
  mode: Mode;
  overrides?: ReadonlyMap<string, string>;
  /**
   * Phase 6: additional fragments computed at session start (e.g. course-context,
   * lock-indicator, memory-inspector). Sorted-in by position alongside the mode's
   * own fragments. Phase 11 will pass multiple fragments here.
   *
   * If an additional fragment shares an id with a mode fragment, it is NOT
   * automatically de-duplicated — use the overrides map to replace by id instead.
   */
  additionalFragments?: ReadonlyArray<PromptFragment>;
}

const FRAGMENT_ORDER: ReadonlyArray<PromptFragment["position"]> = [
  "preamble",
  "role",
  "principles",
  "tools",
  "context",
  "constraints",
  "user-global", // ← user-authored cross-mode fragment (Settings)
  "user-append", // ← user-authored per-mode append (Configure)
  "postamble",
];

/**
 * Build only the system prompt — used by SessionServiceImpl.open().
 * Validates overrides against the mode's fragments. Throws if an override
 * targets a non-customizable fragment.
 */
export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const overrides = input.overrides ?? new Map<string, string>();
  for (const [id] of overrides) {
    const target = input.mode.promptFragments.find((f) => f.id === id);
    if (!target) continue; // Tolerate stale overrides.
    if (!target.customizable) {
      throw new Error(`Fragment "${id}" is not customizable and cannot be overridden`);
    }
  }
  const all = [...input.mode.promptFragments, ...(input.additionalFragments ?? [])];
  const sorted = all.sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );
  return sorted.map((f) => overrides.get(f.id) ?? f.template).join("\n\n");
}

/**
 * Build a complete one-shot brief: system prompt + user message + context.
 * Kept as the brief-shape source of truth and tested in isolation — no
 * production call sites at present (the lifecycle path in `SessionServiceImpl`
 * uses `composeSystemPrompt` directly; `runOneShot` takes `EngineOpenOptions`
 * and a user message string rather than a `Brief`). Reach for this when a
 * future single-turn path needs a `Brief`-shaped value; delete if no caller
 * materialises.
 */
export function composeBrief(input: ComposeBriefInput): ComposedBrief {
  const systemPrompt = composeSystemPrompt({
    mode: input.mode,
    ...(input.overrides !== undefined && { overrides: input.overrides }),
  });
  return {
    systemPrompt,
    userMessage: input.userMessage,
    context: {
      retrievedChunks: input.context?.retrievedChunks ?? [],
      artifactRefs: input.context?.artifactRefs ?? [],
      ...(input.context?.studentSummary !== undefined && {
        studentSummary: input.context.studentSummary,
      }),
    },
    ...(input.maxSteps !== undefined && { maxSteps: input.maxSteps }),
    ...(input.generation !== undefined && { generation: input.generation }),
  };
}
