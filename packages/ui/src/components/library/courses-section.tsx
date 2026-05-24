import type { CourseId, CourseSummary } from "@praxis/core/types";
import { COPY } from "../../lib/copy.js";
import styles from "./courses-section.module.css";
import { LibrarySection } from "./library-section.js";

export interface CoursesSectionProps {
  courses: ReadonlyArray<CourseSummary> | undefined;
  loading: boolean;
  onOpenInTab: (input: { courseId: CourseId; courseTitle: string }) => void;
  /** Called when the user clicks "+ Create a course". */
  onCreateCourse?: () => void;
}

/**
 * Editorial table-of-contents listing for in-progress courses.
 * Each row has the course title as the lead + subject/grade deck + "Continue" CTA.
 * The section header carries a "+ Create a course" affordance for cold-start users.
 * Empty state uses library-specific copy as an invitation.
 */
export function CoursesSection({
  courses,
  loading,
  onOpenInTab,
  onCreateCourse,
}: CoursesSectionProps) {
  return (
    <LibrarySection<CourseSummary>
      ornament="§"
      kicker="COURSES"
      loading={loading}
      items={courses}
      emptyMessage={COPY.empty.libraryCoursesEmpty}
      {...(onCreateCourse !== undefined && {
        headerAction: (
          <button type="button" className={styles.createCta} onClick={onCreateCourse}>
            + Create a course
          </button>
        ),
        emptyAction: { label: "+ Create a course", onClick: onCreateCourse },
      })}
      renderItems={(items) => (
        <ol className={styles.list}>
          {items.map((course) => (
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
    />
  );
}
