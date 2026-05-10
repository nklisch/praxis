import type { Mode } from "@praxis/core/types";
import { assessmentToolsFragment } from "./fragments/assessment-tools.js";
import { assignmentContextFragmentDefault } from "./fragments/assignment-context.js";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { metacognitivePromptsFragment } from "./fragments/metacognitive-prompts.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { quizRoleFragment } from "./fragments/quiz-role.js";
import { sketchAwarenessFragment } from "./fragments/sketch-awareness.js";

export const quizMode: Mode = {
  id: "quiz",
  label: "Quiz",
  description:
    "Short-form retrieval practice. Items shown via card; answers typed in card; immediate feedback after submission.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    quizRoleFragment,
    principlesFragment,
    metacognitivePromptsFragment({
      triggers: ["pre-quiz", "post-error"],
    }), // ← Phase 18: metacognitive coaching guidance
    assessmentToolsFragment,
    sketchAwarenessFragment, // ← Phase 15a: sketch tool usage instructions
    courseContextFragmentDefault,
    assignmentContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    "assignment.show",
    "assignment.read_grade",
    "course.what_can_i_teach",
    "course.current_concept",
    "retrieve_from_textbook",
    "grade_math",
    "code_sandbox",
    "update_mastery",
    "record_misconception",
    "sketch.read", // ← Phase 15a: read student sketches from submissions
    "pedagogy.list_metacognitive_prompts", // ← Phase 18: metacognitive prompts
  ],
  uiSurface: "chat",
};
