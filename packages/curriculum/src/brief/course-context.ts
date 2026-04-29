import type { CourseStateSnapshot, PromptFragment } from "@praxis/core/types";

/**
 * Format a mastery tag for a concept given its effectivePKnown score.
 *
 * Thresholds (Phase 7 defaults, consistent with design Unit 10):
 *   >= 0.80  → "mastered (0.xx)"
 *   >= 0.40  → "in progress (0.xx)"
 *   otherwise → "not yet started"
 *
 * When no mastery data is available for a concept, falls back to
 * the binary studied/not-yet-studied tag from the study log.
 */
export function formatMasteryTag(effectivePKnown: number | undefined, studied: boolean): string {
  if (effectivePKnown === undefined) {
    return studied ? "studied" : "not yet studied";
  }
  if (effectivePKnown >= 0.8) {
    return `mastered (${effectivePKnown.toFixed(2)})`;
  }
  if (effectivePKnown >= 0.4) {
    return `in progress (${effectivePKnown.toFixed(2)})`;
  }
  return "not yet started";
}

/**
 * Build a `context`-position PromptFragment summarizing the active course.
 *
 * Called by SessionServiceImpl when starting a teach session whose courseId
 * resolves via CourseStateReader. The fragment is passed as an override
 * keyed by id "context.course-state" so it replaces the mode's default
 * "no course" fragment.
 *
 * This function is generic — it receives a snapshot and produces text.
 * It does not know which mode called it. Phase 11 may pass additional
 * fragments alongside this one via composeSystemPrompt's additionalFragments.
 *
 * @param masteryByConceptId  Optional map from conceptId string to effectivePKnown
 *   (decay-adjusted). When provided, concept tags show graduated mastery scores
 *   ("mastered (0.85)" / "in progress (0.42)"). When absent, falls back to
 *   binary studied/not-yet-studied from the course study log (Phase 6 behavior).
 */
export function composeCourseContextFragment(
  snapshot: CourseStateSnapshot,
  masteryByConceptId?: ReadonlyMap<string, number>,
): PromptFragment {
  const lines: string[] = [];
  lines.push(
    `Active course: ${snapshot.course.title} (${snapshot.course.subject}, ${snapshot.course.gradeLevel})`,
  );
  if (snapshot.currentLesson) {
    lines.push(`Current lesson: ${snapshot.currentLesson.title}`);
    const conceptRows = snapshot.conceptsByLesson.get(snapshot.currentLesson.id) ?? [];
    if (conceptRows.length > 0) {
      lines.push(`Concepts in this lesson:`);
      for (const c of conceptRows) {
        const effectivePKnown = masteryByConceptId?.get(c.conceptId);
        const tag = formatMasteryTag(effectivePKnown, c.studied);
        lines.push(`  • ${c.name} — ${tag}`);
      }
    }
    if (snapshot.currentLesson.references.length > 0) {
      lines.push(`References:`);
      for (const r of snapshot.currentLesson.references) {
        const locPage = r.locator?.page ? ` (p.${r.locator.page})` : "";
        const locSec = r.locator?.section ? ` [${r.locator.section}]` : "";
        lines.push(`  • ${r.kind}: ${r.source}${locPage}${locSec}`);
      }
    }
    lines.push(`Suggested strategy: ${snapshot.currentLesson.suggestedStrategy}`);
  } else {
    lines.push(
      `This course has no in-progress lesson; all lessons are completed or none have been started.`,
    );
  }
  return {
    id: "context.course-state",
    position: "context",
    // customizable: true so SessionServiceImpl can inject it via the overrides map.
    customizable: true,
    template: lines.join("\n"),
  };
}
