import type { CourseId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { RouteHeader } from "../components/route-header.js";
import { getRouteMeta } from "../components/route-meta.js";
import { usePraxisClient } from "../context/client-context.js";
import { useCourseDetail } from "../hooks/use-course-detail.js";
import { COPY } from "../lib/copy.js";
import { openSessionInTab } from "../lib/open-session-in-tab.js";
import styles from "./course-detail.module.css";

export function CourseDetailRoute() {
  // useParams with strict: false gives us the courseId from /courses/$courseId.
  const { courseId: rawCourseId } = useParams({ strict: false });
  const courseId = rawCourseId ? brandId<"CourseId">(rawCourseId) : undefined;

  const client = usePraxisClient();
  const { course, lessons, loading, error } = useCourseDetail(courseId as CourseId | undefined);
  const navigate = useNavigate();

  // Phase 9: Mark gates as viewed when the student enters the course detail page.
  // This clears the "newly unlocked" badge in the courses list.
  // Fires once per courseId visit; wrapped in try/catch so it never breaks the page.
  useEffect(() => {
    if (!courseId) return;
    client.artifacts.markGatesViewed(courseId).catch(() => {
      // Non-fatal — badge will clear on next successful visit.
    });
  }, [courseId, client]);

  const handleStartSession = async () => {
    if (!courseId || !course) return;
    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "teach", courseId },
      courseTitle: course.title,
    });
  };

  const meta = getRouteMeta("courseDetail");

  if (loading) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>{COPY.loading.courses}</p>
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

  const lessonCount = lessons.length;

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament={meta.ornament}
        kicker={meta.kicker}
        title={course.title}
        deck={`${course.subject} · ${lessonCount} lesson${lessonCount !== 1 ? "s" : ""}`}
        actions={
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => navigate({ to: "/library" })}
          >
            ← Library
          </button>
        }
      />

      {/* Actions section — structured for Phase 11 additions (configure mode). */}
      <section className={styles.actions}>
        <button type="button" className={styles.startBtn} onClick={handleStartSession}>
          Start session
        </button>
        <button
          type="button"
          className={styles.mapBtn}
          onClick={() =>
            navigate({ to: "/courses/$courseId/map", params: { courseId: course.id } })
          }
        >
          View progress map
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
