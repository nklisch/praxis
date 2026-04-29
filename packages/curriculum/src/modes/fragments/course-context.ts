import type { PromptFragment } from "@praxis/core/types";

/**
 * Fallback `context`-position fragment used when a session has no courseId.
 * Included by default in `teach` (and `bootstrap`) mode so the agent has a
 * stable "no active course" signal.
 *
 * SessionServiceImpl REPLACES this fragment's template at session-start time
 * (via the overrides map) when a valid courseId is present. The id
 * "context.course-state" must match what composeCourseContextFragment returns.
 *
 * customizable: true so the overrides mechanism can replace it. The design
 * explicitly chose this over injecting via additionalFragments to avoid
 * duplicate fragments at the same position.
 */
export const courseContextFragmentDefault: PromptFragment = {
  id: "context.course-state",
  position: "context",
  customizable: true,
  template: `No course is loaded for this session. The user is working without a structured curriculum.`,
};
