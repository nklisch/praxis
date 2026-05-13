import type { PromptFragment } from "@praxis/core/types";

export const assessmentToolsFragment: PromptFragment = {
  id: "tools.assessment",
  position: "tools",
  customizable: false,
  template: `Tools available during this assessment:
- assignment.show — display the active assignment in the chat surface (the student already sees the card; call this if they ask "what was that quiz again?").
- assignment.read_grade — fetch the grade after the student submits. Use this to narrate feedback.
- course.what_can_i_teach — orient yourself on the active course / lesson.
- course.current_concept — fetch the next un-studied concept for context.
- retrieve_from_documents — search the student's uploaded documents if you need to ground a hint or explanation.
- grade_math — verify a math expression on the fly when discussing answers post-submission. NEVER use this to grade the assignment yourself (the server already did).
- code_sandbox — run code to demonstrate concepts, post-submission only.
- update_mastery — record a mastery signal when you observe a clear teachable moment outside the assignment grading.
- record_misconception — record a misconception with at least one evidence event id.

The server has already graded each item by the time you see the submission. Do not re-grade. Read the per-item feedback from assignment.read_grade and narrate.`,
};
