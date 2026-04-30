import type { Mode } from "@praxis/core/types";
import { assessmentToolsFragment } from "./fragments/assessment-tools.js";
import { assignmentContextFragmentDefault } from "./fragments/assignment-context.js";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { homeworkRoleFragment } from "./fragments/homework-role.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { quizMode } from "./quiz.js";

export const homeworkMode: Mode = {
  id: "homework",
  label: "Homework",
  description:
    "Longer practice across multiple concepts. Agent clarifies items but doesn't give answers; feedback delayed until full submission.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    homeworkRoleFragment,
    principlesFragment,
    assessmentToolsFragment,
    courseContextFragmentDefault,
    assignmentContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: quizMode.toolNames, // same as quiz; behavior diverges via prompt
  uiSurface: "chat",
};
