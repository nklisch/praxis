import type { PromptFragment } from "@praxis/core/types";

/**
 * Fallback `context`-position fragment used when a session has no assignmentId.
 * SessionServiceImpl REPLACES this fragment's template at session-start time
 * (via the overrides map) when a valid assignmentId is present. The id
 * "context.assignment-state" must match what composeAssignmentContextFragment returns.
 *
 * customizable: true so the overrides mechanism can replace it.
 */
export const assignmentContextFragmentDefault: PromptFragment = {
  id: "context.assignment-state",
  position: "context",
  customizable: true,
  template: `No assignment is bound to this session.`,
};
