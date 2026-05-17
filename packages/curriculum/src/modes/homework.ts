import type { Mode } from "@praxis/core/types";
import { assessmentToolsFragment } from "./fragments/assessment-tools.js";
import { assignmentContextFragmentDefault } from "./fragments/assignment-context.js";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { homeworkRoleFragment } from "./fragments/homework-role.js";
import { behaviorInCourseFragmentDefault } from "./fragments/in-course-behavior.js";
import { metacognitivePromptsFragment } from "./fragments/metacognitive-prompts.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { sketchAwarenessFragment } from "./fragments/sketch-awareness.js";
import { quizMode } from "./quiz.js";

export const homeworkMode: Mode = {
  id: "homework",
  label: "Homework",
  displayName: "homework",
  description:
    "Longer practice across multiple concepts. Agent clarifies items but doesn't give answers; feedback delayed until full submission.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    homeworkRoleFragment,
    principlesFragment,
    metacognitivePromptsFragment({
      triggers: ["pre-reading", "post-error"],
    }), // ← Phase 18: metacognitive coaching guidance
    assessmentToolsFragment,
    sketchAwarenessFragment, // ← Phase 15a: sketch tool usage instructions
    courseContextFragmentDefault,
    behaviorInCourseFragmentDefault.homework, // ← course-aware behavior addendum
    assignmentContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: quizMode.toolNames, // same as quiz (includes sketch.read + pedagogy.list_metacognitive_prompts); behavior diverges via prompt
  uiSurface: "chat",
};
