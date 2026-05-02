import { useNavigate } from "@tanstack/react-router";
import { CourseListItem } from "../components/course-list-item.js";
import { RouteHeader } from "../components/route-header.js";
import { getRouteMeta } from "../components/route-meta.js";
import { usePraxisClient } from "../context/client-context.js";
import { useCourses } from "../hooks/use-courses.js";
import { COPY } from "../lib/copy.js";
import styles from "./courses.module.css";

export function CoursesRoute() {
  const client = usePraxisClient();
  const { courses, newlyUnlocked, loading, error } = useCourses();
  const navigate = useNavigate();
  const meta = getRouteMeta("courses");

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
      <RouteHeader
        ornament={meta.ornament}
        kicker={meta.kicker}
        title={meta.title}
        deck={meta.deck}
        actions={
          <button type="button" className={styles.newCourseBtn} onClick={handleNewCourse}>
            + New course
          </button>
        }
      />

      {loading && <p className={styles.status}>{COPY.loading.courses}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && courses.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyPrimary}>{COPY.empty.courses}</p>
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
