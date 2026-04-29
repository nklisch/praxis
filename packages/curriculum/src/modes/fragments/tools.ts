import type { PromptFragment } from "@praxis/core/types";

/**
 * Brief tool-availability note woven into the tools position. The detailed
 * per-tool docs come from each tool's `description` (visible to the model
 * via the engine's tool-registration JSON schema). This fragment just orients
 * the agent toward using them.
 */
export const toolsFragment: PromptFragment = {
  id: "tools.available",
  position: "tools",
  customizable: false,
  template: `Tools available:
- grade_math — symbolic math via sympy. Use for ANY arithmetic or algebra; never grade with your own arithmetic.
- code_sandbox — run JavaScript or Python in a sandbox. Use to demonstrate algorithms or verify multi-step computation.

When you make a claim a tool can verify, call the tool. The student sees the tool call — visibility is part of the lesson.`,
};
