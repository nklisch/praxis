import { useNavigate } from "@tanstack/react-router";
import { CourseListItem } from "../components/course-list-item.js";
import { usePraxisClient } from "../context/client-context.js";
import { useCourses } from "../hooks/use-courses.js";
import styles from "./courses.module.css";

export function CoursesRoute() {
  const client = usePraxisClient();
  const { courses, newlyUnlocked, loading, error } = useCourses();
  const navigate = useNavigate();

  const handleNewCourse = async () => {
    try {
      const handle = await client.session.start({ modeId: "bootstrap" });
      await navigate({ to: "/", search: { sessionId: handle.sessionId } });
    } catch (_err) {
      // Navigate to chat anyway; the session error will surface there.
      await navigate({ to: "/" });
    }
  };

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.title}>Courses</h1>
        <button type="button" className={styles.newCourseBtn} onClick={handleNewCourse}>
          + New course
        </button>
      </header>

      {loading && <p className={styles.status}>Loading courses…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && courses.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyPrimary}>No courses yet.</p>
          <p className={styles.emptyHint}>
            Upload a syllabus and textbook in chat, then click "New course" to bootstrap one from
            your materials.
          </p>
        </div>
      )}

      {courses.length > 0 && (
        <ul className={styles.list}>
          {courses.map((course) => {
            const count = newlyUnlocked.get(course.courseId);
            return (
              <CourseListItem
                key={course.courseId}
                course={course}
                {...(count !== undefined ? { newlyUnlockedCount: count } : {})}
                onOpen={() =>
                  navigate({ to: "/courses/$courseId", params: { courseId: course.courseId } })
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
