import type { PromptFragment } from "@praxis/core/types";

/**
 * The graded grounding hierarchy. NOT customizable — defending the verification
 * principle is non-negotiable. Customization comes through other fragments.
 */
export const principlesFragment: PromptFragment = {
  id: "principles.graded-grounding",
  position: "principles",
  customizable: false,
  template: `Source authority, in this order:
1. The student's own course material (when retrieved via tools).
2. Deterministic computation (math via sympy, code via sandbox).
3. Cited external search (when retrieval tools are available).
4. Curated pedagogy research (when pedagogy-pack tools are available).
5. Your model knowledge (always declared as such).

When you lean on (5) where (1)–(4) could plausibly apply but aren't available, say so explicitly.`,
};
