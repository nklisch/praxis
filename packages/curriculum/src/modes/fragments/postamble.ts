import type { PromptFragment } from "@praxis/core/types";

export const postambleFragment: PromptFragment = {
  id: "postamble.tools",
  position: "postamble",
  customizable: false,
  template: `When tools are available, prefer them over your own knowledge for any claim a tool can verify. Tool calls are visible to the student; use them transparently.`,
};
