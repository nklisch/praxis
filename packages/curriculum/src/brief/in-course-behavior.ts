import type { CourseStateSnapshot, PromptFragment } from "@praxis/core/types";

export type InCourseBehaviorModeId = "teach" | "quiz" | "homework" | "exam" | "study-skills";

/**
 * Stable fragment id for a given mode's in-course behavior addendum. Used by
 * SessionServiceImpl as the key in the overrides map.
 */
export function behaviorInCourseFragmentId(modeId: InCourseBehaviorModeId): string {
  return `context.behavior-in-course.${modeId}`;
}

/**
 * Build the in-course behavior addendum fragment for a given mode. The
 * template references the facts in `context.course-state` without restating
 * them; the snapshot is passed so the addendum can name the current lesson
 * and cite its assessment plan / concept dependencies.
 *
 * Each mode-addendum story (teach, quiz, homework, exam, study-skills)
 * implements one branch of this dispatcher. Bootstrap and configure modes
 * are intentionally NOT included — they have their own contracts and no
 * notion of an "active course context".
 *
 * See `epic-course-structured-tutor-course-aware-mode-prompts`.
 */
export function composeInCourseBehaviorFragment(
  modeId: InCourseBehaviorModeId,
  snapshot: CourseStateSnapshot,
): PromptFragment {
  const lessonTitle = snapshot.currentLesson?.title ?? "(no current lesson)";
  const courseTitle = snapshot.course.title;
  const id = behaviorInCourseFragmentId(modeId);

  let template: string;
  switch (modeId) {
    case "teach":
      template = `Course-aware behavior (teach): anchor on the concept dependencies in the current lesson ("${lessonTitle}" in "${courseTitle}"). Before generalising, prefer to look up definitions and examples via retrieve_from_documents from this course's attached materials. Author quick checks from the lesson's concept set — do not improvise out-of-scope items. Reference the lesson's assessment plan when offering practice.`;
      break;
    case "quiz":
      template = `Course-aware behavior (quiz): items must draw from the current lesson's concepts ("${lessonTitle}" in "${courseTitle}"). Do not improvise out-of-scope items even if the student asks. When a lesson assessment exists, draw from it; otherwise sample evenly across the lesson's concept set.`;
      break;
    case "homework":
      template = `Course-aware behavior (homework): span the current lesson's concepts ("${lessonTitle}" in "${courseTitle}") with longer-form prompts. Do not hint mid-attempt. Items should exercise the concept dependencies the lesson names; cite the lesson's references when offering scaffolding before the attempt.`;
      break;
    case "exam":
      template = `Course-aware behavior (exam): stay strictly within the assignment-bound items for this course's exam. Do not improvise off-scope content even if the student asks for it. The exam is the closed surface; refer ambiguity back to the bound items.`;
      break;
    case "study-skills":
      template = `Course-aware behavior (study-skills): tie technique demonstrations to the current lesson's concepts ("${lessonTitle}" in "${courseTitle}") and the available documents. When suggesting a technique, name a specific concept from the lesson it applies to; when the technique benefits from source material, point at retrieve_from_documents.`;
      break;
  }

  return {
    id,
    position: "context",
    customizable: true,
    template,
  };
}
