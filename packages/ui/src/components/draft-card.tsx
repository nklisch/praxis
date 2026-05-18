import type { ProposedCourse } from "@praxis/core/types";
import styles from "./draft-card.module.css";
import { LessonAssessmentPills } from "./lesson-assessment-pills.js";

export interface DraftCardProps {
  /** The proposed course from a course.show_draft tool result. */
  proposed: ProposedCourse;
}

/**
 * Renders the structured draft a student can scan during bootstrap mode.
 * Displayed inline in chat when the agent calls `course.show_draft`.
 *
 * Kept generic: accepts { proposed: ProposedCourse } so configure mode
 * (Phase 11) can reuse this without baking bootstrap-specific text in.
 */
export function DraftCard({ proposed: p }: DraftCardProps) {
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.title}>{p.title}</h3>
        <p className={styles.meta}>
          {p.subject} · {p.gradeLevel}
        </p>
      </header>

      <details className={styles.section} open>
        <summary className={styles.sectionSummary}>
          {p.proposedLessons.length} lesson{p.proposedLessons.length !== 1 ? "s" : ""}
        </summary>
        <ol className={styles.lessonList}>
          {p.proposedLessons.map((lesson, i) => {
            // Filter proposed assessments for this draft lesson.
            const lessonPills = (p.proposedLessonAssessments ?? []).filter(
              (a) => a.draftLessonId === lesson.draftLessonId,
            );
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: lesson draft has no stable id yet
              <li key={i} className={styles.lessonItem}>
                <strong className={styles.lessonTitle}>{lesson.title}</strong>
                {lessonPills.length > 0 && <LessonAssessmentPills assessments={lessonPills} />}
                {lesson.conceptNames.length > 0 && (
                  <ul className={styles.conceptList}>
                    {lesson.conceptNames.map((name) => (
                      <li key={name} className={styles.conceptItem}>
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </details>

      <details className={styles.section}>
        <summary className={styles.sectionSummary}>
          {p.proposedConcepts.length} concept{p.proposedConcepts.length !== 1 ? "s" : ""}
        </summary>
        <ul className={styles.flatList}>
          {p.proposedConcepts.map((concept) => (
            <li key={concept.name} className={styles.flatItem}>
              <strong>{concept.name}</strong>
              {concept.description ? ` — ${concept.description}` : ""}
            </li>
          ))}
        </ul>
      </details>

      {p.proposedEdges.length > 0 && (
        <details className={styles.section}>
          <summary className={styles.sectionSummary}>
            {p.proposedEdges.length} prerequisite{p.proposedEdges.length !== 1 ? "s" : ""}
          </summary>
          <ul className={styles.flatList}>
            {p.proposedEdges.map((edge, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: edges have no stable id
              <li key={i} className={styles.flatItem}>
                {edge.fromName} → {edge.toName} ({Math.round(edge.strength * 100)}%)
                {edge.rationale ? ` — ${edge.rationale}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
