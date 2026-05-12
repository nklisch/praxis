export interface ToolLabel {
  /**
   * Present-progressive copy shown while the tool is in flight, e.g.
   * "Looking up textbook references". No trailing ellipsis or punctuation —
   * the renderer adds animated dots for the "live" cue.
   */
  present: string;
  /**
   * Past-tense copy shown after the tool resolves successfully. When omitted,
   * the interstitial collapses (renderer returns null) once the result lands.
   * Set this only when the past-tense line adds standing context next to a
   * renderable surface (e.g. "Cited textbook" alongside SourceCards).
   */
  past?: string;
  /**
   * When true, the interstitial is suppressed entirely — the tool already
   * has its own card surface (quick checks, draft preview, due-card review),
   * so an interstitial would be a doubled signal. Hidden entries still
   * participate in result harvesting; only the visual interstitial is
   * skipped. Default false.
   */
  hidden?: boolean;
}

export const TOOL_LABELS: Readonly<Record<string, ToolLabel>> = {
  // Textbook + retrieval
  retrieve_from_textbook: { present: "Looking up textbook references", past: "Cited textbook" },
  "document.outline": { present: "Reading the table of contents" },
  "document.list_sections": { present: "Scanning sections" },
  "document.read_pages": { present: "Reading pages" },

  // Course bootstrap (drafting)
  "course.start_exploration": { present: "Reading your materials", past: "Read your materials" },
  "course.draft_init": { present: "Sketching a course outline" },
  "course.draft_add_unit": { present: "Adding a unit" },
  "course.draft_add_lessons": { present: "Adding lessons" },
  "course.draft_add_concepts": { present: "Mapping concepts" },
  "course.draft_add_edges": { present: "Connecting concepts" },
  "course.draft_set_assessment_plan": { present: "Setting an assessment plan" },
  "course.draft_add_lesson_assessments": { present: "Drafting lesson assessments" },
  "course.draft_set_metadata": { present: "Updating course details" },
  "course.draft_remove_concept": { present: "Pruning a concept" },
  "course.draft_remove_lesson": { present: "Removing a lesson" },
  "course.show_draft": { present: "Showing the draft", hidden: true },
  "course.confirm_draft": { present: "Saving your course" },
  "course.discard_draft": { present: "Discarding the draft" },
  "course.edit_draft": { present: "Revising the draft" },
  "course.edit": { present: "Updating the course" },

  // Course navigation
  "course.current_concept": { present: "Checking where you are" },
  "course.what_can_i_teach": { present: "Reviewing the syllabus" },
  "course.start_lesson": { present: "Starting the lesson" },
  "course.mark_studied": { present: "Marking concept studied" },
  "course.attach_document": { present: "Attaching a source" },
  "course.detach_document": { present: "Detaching a source" },
  "course.list_course_documents": { present: "Listing course sources" },
  "course.list_library_documents": { present: "Listing your library" },
  "course.list_canonical_packs": { present: "Listing pack templates" },
  "course.use_canonical_pack": { present: "Loading a pack template" },

  // Assessment + grading
  "assignment.create": { present: "Building practice problems" },
  "assignment.show": { present: "Loading the assignment", hidden: true },
  "assignment.read_grade": { present: "Checking your grade" },
  grade_math: { present: "Grading your work", past: "Graded" },

  // Pedagogy
  "pedagogy.get_strategy": { present: "Choosing a teaching approach" },
  "pedagogy.get_technique": { present: "Picking a study technique" },
  "pedagogy.list_metacognitive_prompts": { present: "Considering reflection prompts" },
  "pedagogy.list_strategies": { present: "Reviewing strategies" },
  "pedagogy.list_techniques": { present: "Reviewing techniques" },

  // Memory
  record_misconception: { present: "Noting a misunderstanding", past: "Logged a misunderstanding" },
  update_mastery: { present: "Updating mastery", past: "Updated mastery" },
  "memory.clear_misconception": { present: "Clearing a misunderstanding" },
  "memory.reset_concept": { present: "Resetting concept progress" },
  "memory.export": { present: "Exporting memory" },
  "memory.delete_all": { present: "Clearing memory" },

  // Notes + flashcards
  "note.create": { present: "Writing a note" },
  "note.show": { present: "Showing a note", hidden: true },
  "note.list": { present: "Listing notes" },
  "note.update": { present: "Updating a note" },
  "note.from_session_summary": { present: "Summarising the session as a note" },
  "flashcard.create": { present: "Creating a flashcard" },
  "flashcard.from_note": { present: "Turning a note into flashcards" },
  "flashcard.review": { present: "Recording your review" },
  "flashcard.review_next": { present: "Pulling up your due cards", hidden: true },

  // Quick checks (suppressed — they spawn their own card via the bridge)
  clarification: { present: "Asking a clarifying question", hidden: true },
  "quick_check.confidence": { present: "Asking a quick check", hidden: true },
  "quick_check.matching": { present: "Asking a quick check", hidden: true },
  "quick_check.multi_select": { present: "Asking a quick check", hidden: true },
  "quick_check.short_answer": { present: "Asking a quick check", hidden: true },
  "quick_check.single_choice": { present: "Asking a quick check", hidden: true },

  // Gates
  "gate.create": { present: "Setting up a checkpoint" },
  "gate.delete": { present: "Removing a checkpoint" },
  "gate.edit": { present: "Editing a checkpoint" },
  "gate.override": { present: "Overriding a checkpoint" },

  // Lessons
  "lesson.create": { present: "Adding a lesson" },
  "lesson.delete": { present: "Removing a lesson" },
  "lesson.edit": { present: "Editing the lesson" },

  // Prompt + customization
  "prompt.set_style": { present: "Adjusting tutor style" },
  "prompt.override_fragment": { present: "Customising tutor instructions" },
  "prompt.clear_fragment": { present: "Resetting tutor instructions" },

  // Sketch + sandbox
  "sketch.read": { present: "Looking at your sketch" },
  code_sandbox: { present: "Running code", past: "Ran code" },
};

/**
 * Resolve a tool name to its display copy. Falls back to a humanised version
 * of the name when no entry exists, so newly-added tools render readable
 * text until the labels file is curated.
 */
export function getToolLabel(name: string): ToolLabel {
  const entry = TOOL_LABELS[name];
  if (entry) return entry;
  return { present: humanizeToolName(name) };
}

function humanizeToolName(name: string): string {
  // course.draft_add_unit → "Course / draft add unit"
  return name
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(" "),
    )
    .join(" / ");
}
