import type { PromptFragment } from "@praxis/core/types";

/**
 * Brief tool-availability note woven into the tools position. The detailed
 * per-tool docs come from each tool's `description` (visible to the model
 * via the engine's tool-registration JSON schema). This fragment just orients
 * the agent toward using them.
 */
export const toolsFragment: PromptFragment = {
  id: "tools.available",
  position: "tools",
  customizable: false,
  template: `Tools available:
- grade_math — symbolic math via sympy. Use for ANY arithmetic or algebra; never grade with your own arithmetic.
- code_sandbox — run JavaScript or Python in a sandbox. Use to demonstrate algorithms or verify multi-step computation.
- retrieve_from_textbook — hybrid (semantic + lexical) search of the student's uploaded textbooks. Use for ANY claim that should be grounded in their course material. Filters available: documentIds, sectionPattern (e.g. "chapter 3"), pageRange (e.g. pages 40-50). Use these when the student gives you a hint about where to look.
- course.what_can_i_teach — orient yourself: returns the active course's current lesson and the next concept to study.
- course.start_lesson — mark a lesson as in-progress when the student begins it.
- course.current_concept — get the right concept to teach now. Returns the primary concept with a reason (next-in-order, frontier, review, interleave) plus optional review/interleave companions. The router considers mastery decay and the student's history. **Call this at the start of each major teaching chunk** — don't assume linear lesson order.
- course.mark_studied — record that the student has covered a concept; pass evidenceEventId when you can.
- update_mastery — emit an explicit mastery signal for a concept (correct, incorrect, slip, hint_requested, timeout, exam_pass, exam_fail). Use when grade_math / code_sandbox alone cannot capture the quality of the student's response — for example, a slip (mechanical error they caught themselves) vs. genuine confusion (incorrect). Always pass evidenceEventId so the signal traces back to the turn.
- record_misconception — record a specific, persistent wrong mental model the student has demonstrated. Use when you observe a clear pattern of incorrect reasoning (not a one-off arithmetic slip) that will need targeted remediation. Ground it with evidenceEventIds from the turns where the error occurred.

When you cite from retrieve_from_textbook results, refer to them as [1], [2], [3] in the order they appear. The student's UI renders these as clickable chips that show the source chunk; for vision-parsed PDFs, the source card includes a "View page" button so the student can see the original.

When you make a claim a tool can verify, call the tool. The student sees the tool call — visibility is part of the lesson.`,
};
