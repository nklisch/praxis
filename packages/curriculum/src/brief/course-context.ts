import type {
  CourseStateSnapshot,
  DocumentScopeAttachment,
  PromptFragment,
} from "@praxis/core/types";

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
 * Phase 9 extension: adds a bounded visibility window (course-progress one-liner,
 * current lesson detail, next lesson with lock tag, remaining count, active gate).
 *
 * Called by SessionServiceImpl when starting a teach session whose courseId
 * resolves via CourseStateReader. The fragment is passed as an override keyed by
 * id "context.course-state" so it replaces the mode's default "no course" fragment.
 *
 * @param snapshot          The CourseStateSnapshot from CourseStateReader.read().
 * @param masteryByConceptId  Optional map from conceptId string to effectivePKnown
 *   (decay-adjusted). When provided, concept tags show graduated mastery scores
 *   ("mastered (0.85)" / "in progress (0.42)"). When absent, falls back to
 *   binary studied/not-yet-studied from the course study log (Phase 6 behavior).
 */
export function composeCourseContextFragment(
  snapshot: CourseStateSnapshot,
  masteryByConceptId?: ReadonlyMap<string, number>,
  documents?: ReadonlyArray<DocumentScopeAttachment>,
): PromptFragment {
  const lines: string[] = [];

  // Header
  lines.push(
    `Active course: ${snapshot.course.title} (${snapshot.course.subject}, ${snapshot.course.gradeLevel})`,
  );

  // Phase 9: Course shape one-liner
  const totalLessons = snapshot.lessons.length;
  const currentIdx = snapshot.visibilityWindow.currentLessonIndex;
  const completedLessons = currentIdx; // lessons before currentLessonIndex are completed
  const aheadCount = Math.max(0, totalLessons - completedLessons - 1);
  lines.push(
    `Course progress: ${completedLessons} of ${totalLessons} lessons complete; ${aheadCount} ahead.`,
  );

  // Current lesson — full detail
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

  // Phase 9: Next lesson — title + concept count + lock status
  const nextLessonIndex = currentIdx + 1;
  if (nextLessonIndex < snapshot.lessons.length) {
    const nextLesson = snapshot.lessons[nextLessonIndex];
    if (nextLesson) {
      // Find the gate that guards this lesson (if any).
      const nextLessonGate = snapshot.gates.find(
        (g) => g.gate.guards.kind === "lesson" && g.gate.guards.lessonId === nextLesson.id,
      );
      const isLocked =
        nextLessonGate &&
        nextLessonGate.gate.state.kind !== "unlocked" &&
        nextLessonGate.gate.state.kind !== "overridden";
      const lockTag = isLocked
        ? ` — locked${nextLessonGate.lockReason ? `: ${nextLessonGate.lockReason}` : ""}`
        : "";
      const conceptCount = nextLesson.conceptIds.length;
      lines.push(
        `Up next: "${nextLesson.title}" (${conceptCount} concept${conceptCount === 1 ? "" : "s"})${lockTag}`,
      );
    }
  }

  // Phase 9: Bounded visibility — summarize anything beyond next lesson
  const remainingCount = snapshot.visibilityWindow.remainingCount;
  if (remainingCount > 0) {
    lines.push(`(${remainingCount} more lesson${remainingCount === 1 ? "" : "s"} follow.)`);
  }

  // Phase 9: Active gate — what the student is working toward
  if (snapshot.activeGate) {
    lines.push(`Working toward: unlock — ${snapshot.activeGate.summaryText}`);
    if (snapshot.activeGate.lockReason) {
      lines.push(`  Current status: ${snapshot.activeGate.lockReason}`);
    }
  }

  // Course-aware: list documents attached to this course so the tutor knows
  // what's available via retrieve_from_documents before generalising. Cap at
  // 12 filenames to keep prompts bounded; beyond that, append "…and N more".
  if (documents && documents.length > 0) {
    const MAX_LIST = 12;
    lines.push(`Available documents (course-scope, retrievable via retrieve_from_documents):`);
    const visible = documents.slice(0, MAX_LIST);
    for (const d of visible) {
      lines.push(`  • ${d.filename} (${d.chunkCount} chunks)`);
    }
    if (documents.length > MAX_LIST) {
      lines.push(`  …and ${documents.length - MAX_LIST} more documents.`);
    }
  }

  return {
    id: "context.course-state",
    position: "context",
    // customizable: true so SessionServiceImpl can inject it via the overrides map.
    customizable: true,
    template: lines.join("\n"),
  };
}
