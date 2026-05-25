import type { PromptFragment } from "@praxis/core/types";

/**
 * Injected when `PRAXIS_DEV === "true"`. Explains dev-mode affordances to the
 * agent so it uses `dev.report_issue` proactively rather than guessing or
 * failing silently. Non-customizable — the escape-hatch contract must not be
 * overridden by per-mode user configuration.
 */
export const devModeFragment: PromptFragment = {
  id: "dev.agent-feedback",
  position: "postamble",
  customizable: false,
  template: `## Dev mode

You are running Praxis in a development environment. The \`dev.report_issue\` tool is available for you to surface confusing or broken affordances back to the developer — use it proactively rather than guessing or failing silently.

Use it when:
- A tool description is unclear or contradicts what you can actually do
- Two prompt fragments give contradictory instructions
- A tool you expected is missing
- A tool result is malformed or empty when it shouldn't be
- You can't execute a clearly-asked-for task because of a harness gap

Schema (minimal — escape hatch, not a structured form):
- \`kind\`: one of confusing-tool / contradictory-prompt / missing-tool / broken-result / cant-execute / other
- \`summary\`: one-line description
- optional: \`severity\` (low/med/high), \`tool_ref\` (tool name), \`fragment_ref\` (fragment id), \`details\` (long markdown)

Reports land in \`.praxis/dev-reports/\` as markdown files for the developer to triage between turns.`,
};
