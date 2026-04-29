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
}

const FRAGMENT_ORDER: ReadonlyArray<PromptFragment["position"]> = [
  "preamble",
  "role",
  "principles",
  "tools",
  "context",
  "constraints",
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
  const sorted = [...input.mode.promptFragments].sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );
  return sorted.map((f) => overrides.get(f.id) ?? f.template).join("\n\n");
}

/**
 * Build a complete one-shot brief: system prompt + user message + context.
 * Used by `runOneShot` and any future single-turn paths. The lifecycle path
 * (SessionServiceImpl) uses `composeSystemPrompt` directly.
 *
 * Note: `Brief` is now a curriculum-local type (`ComposedBrief`). Engines
 * no longer accept Brief — they accept EngineOpenOptions (system prompt) and
 * a user message string.
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
