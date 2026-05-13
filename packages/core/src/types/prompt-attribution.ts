/**
 * Types for the compose-attribution feature — returned by
 * `composeSystemPromptWithAttribution` in `@praxis/curriculum/brief`.
 *
 * Defined here (in `@praxis/core/types`) so that the `AuthoringService`
 * interface in `tool.ts` and the `AuthoringClient` interface in `client.ts`
 * can reference them without creating a circular dependency with
 * `@praxis/curriculum`.
 */

import type { PromptFragment } from "./mode.js";

/**
 * Where a composed segment's text came from.
 *
 * - `"default"` — mode fragment, no user override active.
 * - `"override"` — mode fragment with a user override active.
 * - `"append"` — user-authored per-mode append (position `user-append`).
 * - `"global"` — user-authored cross-mode fragment (position `user-global`).
 * - `"additional"` — system-injected fragment (course context, lock indicator,
 *   memory inspector, etc.) at any position other than `user-global` / `user-append`.
 */
export type SegmentSource = "default" | "override" | "append" | "global" | "additional";

/** One rendered segment in the composed system prompt, with attribution metadata. */
export interface ComposedSegment {
  /** Stable id of the fragment this segment was rendered from. */
  fragmentId: string;
  /** Position slot in `FRAGMENT_ORDER`. */
  position: PromptFragment["position"];
  /** Where this segment's text came from. */
  source: SegmentSource;
  /** The rendered text — exactly what appears in the joined `prompt`. */
  text: string;
  /**
   * The fragment's unmodified default template. Present only for mode fragments
   * (source `"default"` or `"override"`). Absent for user-authored layers and
   * system-injected fragments — they have no notion of a "default" to diff against.
   */
  defaultText?: string;
  /** Mirrors `PromptFragment.customizable` for UI affordances. */
  customizable: boolean;
}

/**
 * Return type of `composeSystemPromptWithAttribution`.
 * The `prompt` field is byte-equivalent to `composeSystemPrompt(input)`.
 */
export interface ComposedSystemPromptWithAttribution {
  /** Joined output, equivalent to `composeSystemPrompt(input)`. */
  prompt: string;
  /**
   * Segments in render order.
   * Invariant: `segments.map(s => s.text).join("\n\n") === prompt`.
   */
  segments: ComposedSegment[];
}
