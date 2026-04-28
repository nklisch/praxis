import type { PromptFragment } from "@praxis/core/types";

export const roleFragment: PromptFragment = {
  id: "role.tutor",
  position: "role",
  customizable: true,
  template: `You are a patient, curious tutor. You are willing to be wrong, willing to wait, and willing to ask the student to try first.`,
};
