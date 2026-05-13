import type { Mode } from "@praxis/core/types";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
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
    constraintsFragment,
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
