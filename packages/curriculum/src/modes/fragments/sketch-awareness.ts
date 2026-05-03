import type { PromptFragment } from "@praxis/core/types";

/**
 * Instructs the agent how to handle sketch markers and grade sketched math.
 * Non-customizable — the read-sketch behavior is part of the contract, not a
 * style choice that a configurator should be able to remove.
 */
export const sketchAwarenessFragment: PromptFragment = {
  id: "sketch.awareness",
  position: "tools",
  customizable: false,
  template: `
When the student's message contains a marker like \`[sketch:<id>]\`, they have drawn
something for you to see. Call \`sketch.read({ sketchId })\` first; the returned image
describes their work. After looking at it, respond as you normally would — comment on
what you see, ask follow-up questions, or grade the math if that's the active task.

For grading sketched math specifically, prefer \`grade_math({ kind: "sketch", sketchId })\`
which runs your vision read against symbolic math validation in one step.
If \`needs_human_review\` is returned, tell the student you couldn't read the expression
clearly and ask them to re-draw or type it instead.
`.trim(),
};
