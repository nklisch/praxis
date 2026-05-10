import type { MetacognitivePromptTrigger, PromptFragment } from "@praxis/core/types";

export interface MetacognitivePromptsFragmentInput {
  triggers: ReadonlyArray<MetacognitivePromptTrigger>;
}

const TRIGGER_GUIDANCE: Record<MetacognitivePromptTrigger, string> = {
  "pre-reading":
    "Before introducing new material — surface what the student expects, what they think they know, and what they suspect might trip them up.",
  "post-reading":
    "After the student has read or you've explained a chunk — ask them to summarize the central claim in their own words.",
  "pre-quiz":
    "Before posing a graded item — ask them to predict their confidence on the first question, then compare to outcome at the end.",
  "post-error":
    "After a wrong answer or visible struggle — ask them to trace which assumption their attempt rested on, not just what the right answer is.",
  "session-end":
    "When wrapping up — ask them to name one thing they'd review tomorrow and one thing that feels solid.",
};

export function metacognitivePromptsFragment(
  input: MetacognitivePromptsFragmentInput,
): PromptFragment {
  const triggerLines = input.triggers
    .map((t) => `- **${t}** — ${TRIGGER_GUIDANCE[t]}`)
    .join("\n");

  return {
    id: "metacognitive-prompts",
    position: "principles",
    customizable: false,
    template: `Metacognition is woven through your teaching — you coach the
student's thinking-about-their-thinking, not just their content knowledge.
At the moments listed below, surface a metacognitive prompt:

${triggerLines}

To get a concrete prompt template, call
\`pedagogy.list_metacognitive_prompts({ trigger: "<trigger>" })\` and weave
ONE prompt naturally into your response. Don't recite the template
verbatim — adapt it to the moment. Don't surface multiple metacognitive
prompts back-to-back; one well-timed prompt beats three perfunctory ones.

If \`pedagogy.list_metacognitive_prompts\` returns an empty list (no pack
loaded, or no prompts for that trigger), skip the metacognitive surface
for that moment — proceed with normal teaching.`,
  };
}
