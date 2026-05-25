/**
 * Shared validation helper for every question-emitting tool.
 *
 * Checks question payloads against the resolved `QuestionConstraints` for the
 * current mode and returns a structured result so callers can surface an
 * agent-friendly error message rather than silently truncating or ignoring
 * over-cap input.
 *
 * Note on `multiSelectCap`: this cap governs the maximum number of *answers*
 * the student may select, not the shape of the question payload itself. It is
 * NOT enforced here. Enforcement belongs in the answer-handling path (e.g.
 * inside the quick_check response handler) where the actual selection count is
 * known. The field is included in `ValidationResult` so callers can reference
 * it in failure messages if they choose.
 */

import type { QuestionConstraints } from "@praxis/core/types";

// ── Public types ──────────────────────────────────────────────────────────────

export interface QuestionPayloadForValidation {
  prompt: string;
  options: Array<{ label: string } | string>;
  multiSelect?: boolean;
}

export type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: "QUESTION_CONSTRAINT_VIOLATION";
      field: "prompt" | "options" | "choiceCount" | "multiSelectCap";
      message: string;
    };

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Validate a question payload against the mode's resolved constraints.
 *
 * Checks, in order:
 *  1. Prompt word count vs `promptMaxWords`
 *  2. Option count vs `choiceCount`
 *  3. Per-option label word count vs `choiceMaxWords`
 *
 * `multiSelectCap` is intentionally NOT enforced here — see module-level note.
 *
 * @param payload     - The question to validate (prompt + options).
 * @param constraints - Fully-resolved constraints (no optional fields).
 * @param modeLabel   - Human-readable mode name used in error messages (e.g. "teach").
 */
export function validateQuestionConstraints(
  payload: QuestionPayloadForValidation,
  constraints: Required<QuestionConstraints>,
  modeLabel: string,
): ValidationResult {
  const promptWords = countWords(payload.prompt);
  if (promptWords > constraints.promptMaxWords) {
    return {
      ok: false,
      code: "QUESTION_CONSTRAINT_VIOLATION",
      field: "prompt",
      message: `Question prompt too long for ${modeLabel} mode (${promptWords} words; max ${constraints.promptMaxWords}). Trim to the essential framing; move reasoning into the preceding tutor turn.`,
    };
  }

  if (payload.options.length > constraints.choiceCount) {
    return {
      ok: false,
      code: "QUESTION_CONSTRAINT_VIOLATION",
      field: "choiceCount",
      message: `Too many choices for ${modeLabel} mode (${payload.options.length}; max ${constraints.choiceCount}). Cut to the most discriminating options.`,
    };
  }

  for (let i = 0; i < payload.options.length; i++) {
    const option = payload.options[i];
    const labelText = typeof option === "string" ? option : (option as { label: string }).label;
    const labelWords = countWords(labelText);
    if (labelWords > constraints.choiceMaxWords) {
      return {
        ok: false,
        code: "QUESTION_CONSTRAINT_VIOLATION",
        field: "options",
        message: `Choice ${i + 1} text too long for ${modeLabel} mode (${labelWords} words; max ${constraints.choiceMaxWords}). Compress to the choice's distinguishing feature; longer reasoning belongs in the preceding tutor turn.`,
      };
    }
  }

  return { ok: true };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Count the number of whitespace-delimited words in a string.
 * Leading/trailing whitespace is stripped before splitting.
 * An empty string (or whitespace-only) returns 0.
 */
function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
