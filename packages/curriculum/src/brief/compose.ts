import type {
  Brief,
  BriefContext,
  GenerationParams,
  Mode,
  PromptFragment,
} from "@praxis/core/types";

export interface ComposeBriefInput {
  mode: Mode;
  userMessage: string;
  context?: Partial<BriefContext>;
  /** Map of fragment ID → override text (from configure-mode customization). */
  overrides?: ReadonlyMap<string, string>;
  generation?: GenerationParams;
  maxSteps?: number;
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
 * Assemble a Brief by ordering and joining the mode's prompt fragments,
 * applying customization overrides where allowed. Throws if an override
 * targets a non-customizable fragment.
 */
export function composeBrief(input: ComposeBriefInput): Brief {
  const overrides = input.overrides ?? new Map<string, string>();
  for (const [id] of overrides) {
    const target = input.mode.promptFragments.find((f) => f.id === id);
    if (!target) continue; // Tolerate stale overrides (the fragment might have been removed).
    if (!target.customizable) {
      throw new Error(`Fragment "${id}" is not customizable and cannot be overridden`);
    }
  }
  const sortedByPosition = [...input.mode.promptFragments].sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );
  const sections = sortedByPosition.map((f) => overrides.get(f.id) ?? f.template);
  return {
    systemPrompt: sections.join("\n\n"),
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
