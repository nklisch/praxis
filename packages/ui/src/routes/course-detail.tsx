import type { CourseId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { usePraxisClient } from "../context/client-context.js";
import { useCourseDetail } from "../hooks/use-course-detail.js";
import styles from "./course-detail.module.css";

export function CourseDetailRoute() {
  // useParams with strict: false gives us the courseId from /courses/$courseId.
  const { courseId: rawCourseId } = useParams({ strict: false });
  const courseId = rawCourseId ? brandId<"CourseId">(rawCourseId) : undefined;

  const client = usePraxisClient();
  const { course, lessons, loading, error } = useCourseDetail(courseId as CourseId | undefined);
  const navigate = useNavigate();

  const handleStartSession = async () => {
    if (!courseId) return;
    try {
      const handle = await client.session.start({ modeId: "teach", courseId });
      await navigate({ to: "/", search: { sessionId: handle.sessionId } });
    } catch (_err) {
      await navigate({ to: "/" });
    }
  };

  if (loading) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.layout}>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>Course not found.</p>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate({ to: "/courses" })}
        >
          ← Courses
        </button>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>{course.title}</h1>
          <p className={styles.meta}>
            {course.subject} · {course.gradeLevel}
          </p>
        </div>
      </header>

      {/* Actions section — structured for Phase 11 additions (configure mode). */}
      <section className={styles.actions}>
        <button type="button" className={styles.startBtn} onClick={handleStartSession}>
          Start session
        </button>
      </section>

      <section className={styles.lessonsSection}>
        <h2 className={styles.sectionTitle}>Lessons</h2>
        {lessons.length === 0 ? (
          <p className={styles.emptyLessons}>No lessons found for this course.</p>
        ) : (
          <ol className={styles.lessonList}>
            {lessons.map((lesson, i) => (
              <li key={lesson.id} className={styles.lessonItem}>
                <span className={styles.lessonIndex}>Lesson {i + 1}</span>
                <div className={styles.lessonBody}>
                  <span className={styles.lessonTitle}>{lesson.title}</span>
                  <span className={styles.lessonMeta}>
                    {lesson.conceptIds.length} concept
                    {lesson.conceptIds.length !== 1 ? "s" : ""} · ~{lesson.estimatedMinutes} min
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
