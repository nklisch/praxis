import type {
  BriefContext,
  ComposedSegment,
  ComposedSystemPromptWithAttribution,
  GenerationParams,
  Mode,
  PromptFragment,
  SegmentSource,
} from "@praxis/core/types";

// Re-export attribution types so callers that import from `@praxis/curriculum/brief`
// get the full public surface without having to reach into `@praxis/core/types` directly.
export type { ComposedSegment, ComposedSystemPromptWithAttribution, SegmentSource };

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

export const FRAGMENT_ORDER: ReadonlyArray<PromptFragment["position"]> = [
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
 *
 * Delegates to `composeSystemPromptWithAttribution` and discards the segments.
 * Byte-equivalent output to the former hand-rolled implementation.
 */
export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  return composeSystemPromptWithAttribution(input).prompt;
}

/**
 * Build the system prompt and return per-segment source attribution alongside it.
 *
 * Used by the diff-aware preview pane. Each `ComposedSegment` carries enough
 * information for the renderer to highlight what the user changed and diff
 * overridden text against the fragment default.
 *
 * Invariant: `segments.map(s => s.text).join("\n\n") === prompt`.
 *
 * Validates overrides the same way `composeSystemPrompt` does — stale overrides
 * (id not in the mode) are tolerated; non-customizable overrides throw.
 *
 * Edge case: if an additional fragment shares an id with a mode fragment, both
 * are attributed as mode fragments (both pass `modeFragmentIds.has(f.id)`). This
 * mirrors the existing behavior of `composeSystemPrompt`, which also doesn't
 * de-duplicate on id. The "don't share ids" foot-gun is documented on
 * `ComposeSystemPromptInput.additionalFragments`.
 */
export function composeSystemPromptWithAttribution(
  input: ComposeSystemPromptInput,
): ComposedSystemPromptWithAttribution {
  const overrides = input.overrides ?? new Map<string, string>();

  // Same validation as the original composeSystemPrompt.
  for (const [id] of overrides) {
    const target = input.mode.promptFragments.find((f) => f.id === id);
    if (!target) continue; // Tolerate stale overrides.
    if (!target.customizable) {
      throw new Error(`Fragment "${id}" is not customizable and cannot be overridden`);
    }
  }

  // Build once for O(1) attribution lookups across the sorted array.
  const modeFragmentIds = new Set(input.mode.promptFragments.map((f) => f.id));

  const all = [...input.mode.promptFragments, ...(input.additionalFragments ?? [])];
  const sorted = all.sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );

  const segments: ComposedSegment[] = sorted.map((f) => {
    if (modeFragmentIds.has(f.id)) {
      // Mode fragment — may be default or user-overridden.
      const hasOverride = overrides.has(f.id);
      const source: SegmentSource = hasOverride ? "override" : "default";
      const text = hasOverride ? (overrides.get(f.id) as string) : f.template;
      return {
        fragmentId: f.id,
        position: f.position,
        source,
        text,
        defaultText: f.template,
        customizable: f.customizable,
      };
    }

    // Additional fragment — classify by position.
    let source: SegmentSource;
    if (f.position === "user-global") source = "global";
    else if (f.position === "user-append") source = "append";
    else source = "additional";

    return {
      fragmentId: f.id,
      position: f.position,
      source,
      text: f.template,
      // No defaultText for user-authored or system-injected fragments — they have
      // no notion of a "default" to diff against.
      customizable: f.customizable,
    };
  });

  return {
    prompt: segments.map((s) => s.text).join("\n\n"),
    segments,
  };
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
