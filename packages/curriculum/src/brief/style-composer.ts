/**
 * Style composer — pure function.
 *
 * Translates three style-slider values into `prompt_overrides`-compatible
 * fragment override strings. No DB, no LLM, no time dependency.
 * Same inputs → same outputs always.
 *
 * Slider ranges: each value is in [-1, +1].
 *   socratic:   -1 = pure Socratic (question-led), +1 = pure Lecture (explain-first)
 *   verbosity:  -1 = terse / minimal, +1 = expansive / verbose
 *   formality:  -1 = formal academic, +1 = casual conversational
 *
 * Threshold for "notable" position: |value| >= 0.3.
 * Values in (-0.3, 0.3) produce the neutral "balance" text.
 */

export interface StyleOverride {
  modeId: string;
  fragmentId: string;
  template: string;
}

export interface StyleSliderValues {
  /** -1 = pure Socratic (question-led), +1 = pure Lecture (explain-first). */
  socratic: number;
  /** -1 = terse / concise, +1 = expansive / verbose. */
  verbosity: number;
  /** -1 = formal academic, +1 = casual conversational. */
  formality: number;
}

/**
 * Compose three style-slider values into prompt-fragment overrides.
 * Returns one override per (modeId, fragmentId) pair that should be written
 * to the `prompt_overrides` table.
 *
 * Currently targets:
 *  - `role.tutor` across teach / quiz / homework / study-skills modes
 *  - `constraints.productive-struggle` in teach mode
 */
export function composeStyleOverrides(values: StyleSliderValues): StyleOverride[] {
  const out: StyleOverride[] = [];

  // role.tutor — applied to all instructional modes for consistency.
  for (const modeId of ["teach", "quiz", "homework", "study-skills"]) {
    out.push({
      modeId,
      fragmentId: "role.tutor",
      template: composeTutorRole(values),
    });
  }

  // constraints.productive-struggle — teach mode only.
  out.push({
    modeId: "teach",
    fragmentId: "constraints.productive-struggle",
    template: composeProductiveStruggle(values),
  });

  return out;
}

/**
 * Compose the `role.tutor` fragment text from slider values.
 *
 * Each slider contributes an independent sentence when the value is "notable"
 * (|v| >= 0.3). Neutral positions produce a balanced default sentence.
 */
export function composeTutorRole(values: StyleSliderValues): string {
  const lines: string[] = [];

  // Socratic ↔ Lecture dimension.
  if (values.socratic <= -0.3) {
    lines.push(
      "Lead with questions; ask the student to discover before you tell. Resist explaining until they've grappled.",
    );
  } else if (values.socratic >= 0.3) {
    lines.push(
      "Explain clearly; offer worked examples. Ask questions when they help check understanding, not as a default.",
    );
  } else {
    lines.push(
      "Balance asking and telling. Question when discovery serves the student; explain when efficiency does.",
    );
  }

  // Verbosity dimension.
  if (values.verbosity <= -0.3) {
    lines.push("Be concise. Short sentences; minimal preamble.");
  } else if (values.verbosity >= 0.3) {
    lines.push("Be expansive. Connect ideas; offer multiple framings; pause for context.");
  }

  // Formality dimension.
  // Note: the design's mapping is -1 = formal, +1 = casual (formality slider).
  if (values.formality <= -0.3) {
    lines.push("Use formal academic language; avoid casual contractions.");
  } else if (values.formality >= 0.3) {
    lines.push("Use casual conversational tone; first-person plural is fine ('let's').");
  }

  return lines.join(" ");
}

/**
 * Compose the `constraints.productive-struggle` fragment.
 * Currently independent of slider values; returns the canonical text from Phase 6.
 * Future: could scale the "resistance" based on the socratic slider.
 */
export function composeProductiveStruggle(_values: StyleSliderValues): string {
  return "Productive struggle is teaching's tool. When the student says 'just tell me', respond with a scaffold or smaller question.";
}
