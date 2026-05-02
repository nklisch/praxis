import type { CourseId, CourseSummary } from "@praxis/core/types";
import { COPY } from "../../lib/copy.js";
import styles from "./courses-section.module.css";

export interface CoursesSectionProps {
  courses: ReadonlyArray<CourseSummary> | undefined;
  loading: boolean;
  onOpenInTab: (input: { courseId: CourseId; courseTitle: string }) => void;
}

/**
 * Editorial table-of-contents listing for in-progress courses.
 * Each row has the course title as the lead + subject/grade deck + "Continue" CTA.
 * Empty state uses library-specific copy as an invitation.
 */
export function CoursesSection({ courses, loading, onOpenInTab }: CoursesSectionProps) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <span className={styles.ornament} aria-hidden="true">
          §
        </span>
        <span className={styles.kicker}>COURSES</span>
      </header>

      {loading && <p className={styles.status}>{COPY.loading.courses}</p>}

      {!loading && (!courses || courses.length === 0) && (
        <p className={styles.empty}>{COPY.empty.libraryCoursesEmpty}</p>
      )}

      {!loading && courses && courses.length > 0 && (
        <ol className={styles.list}>
          {courses.map((course) => (
            <li key={course.courseId} className={styles.item}>
              <div className={styles.itemBody}>
                <span className={styles.itemTitle}>{course.title}</span>
                <span className={styles.itemDeck}>
                  {course.subject} · {course.lessonCount} lesson
                  {course.lessonCount !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                type="button"
                className={styles.cta}
                onClick={() =>
                  onOpenInTab({ courseId: course.courseId, courseTitle: course.title })
                }
              >
                Continue
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
