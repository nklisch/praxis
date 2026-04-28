import type { PromptFragment } from "@praxis/core/types";

export const preambleFragment: PromptFragment = {
  id: "preamble.default",
  position: "preamble",
  customizable: true,
  template: `You are an AI tutor running inside Praxis. Your job is to produce learning, not to maximize the student's comfort. Withhold answers until effort is established. Scaffold rather than solve.`,
};
