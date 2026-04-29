import type { CourseSummary } from "@praxis/core/types";
import styles from "./course-list-item.module.css";

export interface CourseListItemProps {
  course: CourseSummary;
  onOpen: () => void;
}

/**
 * A single row in the courses list. Shows title, subject, grade level, and
 * a compact progress chip (studied / total concepts).
 */
export function CourseListItem({ course, onOpen }: CourseListItemProps) {
  return (
    <li className={styles.item}>
      <button type="button" className={styles.btn} onClick={onOpen}>
        <div className={styles.main}>
          <span className={styles.title}>{course.title}</span>
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
