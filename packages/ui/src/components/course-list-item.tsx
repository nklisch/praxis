import type { CourseSummary } from "@praxis/core/types";
import styles from "./course-list-item.module.css";

export interface CourseListItemProps {
  course: CourseSummary;
  onOpen: () => void;
  /** Phase 9: count of gates unlocked since the student last viewed this course. */
  newlyUnlockedCount?: number;
}

/**
 * A single row in the courses list. Shows title, subject, grade level, and
 * a compact progress chip (studied / total concepts).
 *
 * Phase 9: shows a "newly unlocked" badge when `newlyUnlockedCount > 0`.
 */
export function CourseListItem({ course, onOpen, newlyUnlockedCount }: CourseListItemProps) {
  const hasNewUnlocks = typeof newlyUnlockedCount === "number" && newlyUnlockedCount > 0;

  return (
    <li className={styles.item}>
      <button type="button" className={styles.btn} onClick={onOpen}>
        <div className={styles.main}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{course.title}</span>
            {hasNewUnlocks && (
              <span className={styles.unlockBadge} role="status">
                {newlyUnlockedCount} new unlock{newlyUnlockedCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <span className={styles.meta}>
            {course.subject} · {course.gradeLevel}
          </span>
        </div>
        <div className={styles.stats}>
          <span className={styles.progress}>
            {course.studiedConcepts}/{course.conceptCount} concepts
          </span>
          <span className={styles.lessonCount}>{course.lessonCount} lessons</span>
        </div>
      </button>
    </li>
  );
}
