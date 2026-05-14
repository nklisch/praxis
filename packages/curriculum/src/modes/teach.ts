import type { Mode } from "@praxis/core/types";
import { constraintsFragment } from "./fragments/constraints.js";
import { courseContextFragmentDefault } from "./fragments/course-context.js";
import { behaviorInCourseFragmentDefault } from "./fragments/in-course-behavior.js";
import { metacognitivePromptsFragment } from "./fragments/metacognitive-prompts.js";
import { postambleFragment } from "./fragments/postamble.js";
import { preambleFragment } from "./fragments/preamble.js";
import { principlesFragment } from "./fragments/principles.js";
import { roleFragment } from "./fragments/role.js";
import { sketchAwarenessFragment } from "./fragments/sketch-awareness.js";
import { toolsFragment } from "./fragments/tools.js";

export const teachMode: Mode = {
  id: "teach",
  label: "Teach",
  displayName: "teach",
  description:
    "Interactive lecture mode: introduce concepts, scaffold worked examples, fade to independent practice.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    roleFragment,
    principlesFragment,
    metacognitivePromptsFragment({
      triggers: ["pre-reading", "post-error", "session-end"],
    }), // ← Phase 18: metacognitive coaching guidance
    toolsFragment,
    sketchAwarenessFragment, // ← Phase 15a: sketch tool usage instructions
    courseContextFragmentDefault, // ← Phase 6: replaced at session start when courseId is set
    behaviorInCourseFragmentDefault.teach, // ← course-aware behavior addendum (replaced when courseId is set)
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    "grade_math",
    "code_sandbox",
    "retrieve_from_documents",
    "course.what_can_i_teach", // ← Phase 6 nav tools
    "course.start_lesson",
    "course.current_concept",
    "course.mark_studied",
    "update_mastery", // ← Phase 7 active-path memory tools
    "record_misconception",
    "assignment.create", // ← Phase 8: tutor authors assignments
    // Phase 12: notes + flashcards
    "note.create",
    "note.update",
    "note.show",
    "note.list",
    "note.from_session_summary",
    "flashcard.create",
    "flashcard.from_note",
    "flashcard.review",
    "flashcard.review_next",
    "sketch.read", // ← Phase 15a: read student sketches from chat
    // Phase 17: inline formative quick checks
    "quick_check.single_choice",
    "quick_check.multi_select",
    "quick_check.short_answer",
    "quick_check.matching",
    "quick_check.confidence",
    "pedagogy.list_metacognitive_prompts", // ← Phase 18: metacognitive prompts
  ],
  uiSurface: "chat",
};
