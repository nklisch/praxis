import type { PromptFragment } from "@praxis/core/types";

export const examToolsFragment: PromptFragment = {
  id: "tools.exam",
  position: "tools",
  customizable: false,
  template: `Tools available during this exam:
- assignment.show — display the active exam in the chat surface.
- assignment.read_grade — fetch the grade after the student submits. Use this AFTER submission to narrate per-item feedback.

You have no other tools available. The exam is graded by the server using deterministic graders for math/code/MC/short-answer and a rubric agent (per-criterion 0-10 scoring against the explicit rubric authored at item-create time) for free-response. Approach-feedback enrichment is OFF for exams. Do not attempt to teach, hint, or grade. The exam is a measure; you are the proctor.`,
};
