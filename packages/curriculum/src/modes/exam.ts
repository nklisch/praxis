import type { Mode } from "@praxis/core/types";
import { DEFAULT_QUESTION_CONSTRAINTS_BY_MODE, FALLBACK_QUESTION_CONSTRAINTS } from "../question-constraints.js";
import { assignmentContextFragmentDefault } from "./fragments/assignment-context.js";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { examRoleFragment } from "./fragments/exam-role.js";
import { examToolsFragment } from "./fragments/exam-tools.js";
import { behaviorInCourseFragmentDefault } from "./fragments/in-course-behavior.js";
import { metacognitivePromptsFragment } from "./fragments/metacognitive-prompts.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { questionToolFragment } from "./fragments/question-tool.js";
import { sketchAwarenessFragment } from "./fragments/sketch-awareness.js";

export const examMode: Mode = {
  id: "exam",
  label: "Exam",
  displayName: "exam",
  description:
    "Gated assessment. Strict tool subset; no help during the exam; feedback only after full submission.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    examRoleFragment,
    principlesFragment,
    metacognitivePromptsFragment({
      triggers: ["session-end"],
    }), // ← Phase 18: session-end reflection only; verification stance forbids during-exam coaching
    examToolsFragment,
    sketchAwarenessFragment, // ← Phase 15a: sketch tool usage instructions
    courseContextFragmentDefault,
    behaviorInCourseFragmentDefault.exam, // ← course-aware behavior addendum
    assignmentContextFragmentDefault,
    constraintsFragment,
    questionToolFragment(DEFAULT_QUESTION_CONSTRAINTS_BY_MODE.exam ?? FALLBACK_QUESTION_CONSTRAINTS, "Exam"), // ← question caps + content conventions
    postambleFragment,
  ],
  toolNames: [
    "assignment.show",
    "assignment.read_grade",
    "sketch.read", // ← Phase 15a: read student sketches from exam submissions
    "clarification", // ← Phase 16: rephrase a confusing prompt; no method or answer revealed
    "pedagogy.list_metacognitive_prompts", // ← Phase 18: session-end reflection; read-only metadata, safe in verification stance
    // No retrieve_from_documents, no mastery / misconception tools, no graders
    // (server handles all grading). Deliberately minimal.
  ],
  uiSurface: "chat",
};
