import type { Mode } from "@praxis/core/types";
import { DEFAULT_QUESTION_CONSTRAINTS_BY_MODE, FALLBACK_QUESTION_CONSTRAINTS } from "../question-constraints.js";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { behaviorInCourseFragmentDefault } from "./fragments/in-course-behavior.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { questionToolFragment } from "./fragments/question-tool.js";
import { studySkillsRoleFragment } from "./fragments/study-skills-role.js";
import { toolsFragment } from "./fragments/tools.js";

export const studySkillsMode: Mode = {
  id: "study-skills",
  label: "Study Skills",
  displayName: "study skills",
  description:
    "Metacognition coach mode: teach techniques (Cornell notes, Feynman, spaced repetition, concept mapping) and the cognitive principles behind them.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    studySkillsRoleFragment,
    principlesFragment,
    toolsFragment,
    courseContextFragmentDefault,
    behaviorInCourseFragmentDefault["study-skills"], // ← course-aware behavior addendum
    constraintsFragment,
    questionToolFragment(DEFAULT_QUESTION_CONSTRAINTS_BY_MODE["study-skills"] ?? FALLBACK_QUESTION_CONSTRAINTS, "Study Skills"), // ← question caps + content conventions
    postambleFragment,
  ],
  toolNames: [
    // Pedagogy pack reads — authoritative content for techniques + strategies.
    "pedagogy.list_strategies",
    "pedagogy.get_strategy",
    "pedagogy.list_techniques",
    "pedagogy.get_technique",
    "pedagogy.list_metacognitive_prompts",
    // Concept-graph navigation for concept-mapping exercises.
    "course.what_can_i_teach",
    // Workspace tools — Cornell, Feynman, free-form notes; FSRS-backed flashcards.
    "note.create",
    "note.update",
    "note.show",
    "note.list",
    "note.from_session_summary",
    "flashcard.create",
    "flashcard.from_note",
    "flashcard.review",
    "flashcard.review_next",
    // Quick-check formative probes — natural fit for "did the technique land?".
    "quick_check.single_choice",
    "quick_check.multi_select",
    "quick_check.short_answer",
    "quick_check.confidence",
  ],
  uiSurface: "chat",
};
