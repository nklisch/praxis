import type { DraftCourseState } from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { CourseListItem } from "../components/course-list-item.js";
import { displayTitle, ResumeDraftPicker } from "../components/resume-draft-picker.js";
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
    await navigate({ to: "/course-create" });
  };

  const handleResumeDraft = async (draft: DraftCourseState) => {
    try {
      const handle = await client.session.start({ modeId: "course-create" });
      await navigate({ to: "/", search: { sessionId: handle.sessionId } });
      // Seed the course-create conversation so the model picks up the draftId.
      // The model already knows the resume-via-course.start_drafting(draftId)
      // protocol per the course-create-role fragment. We send a one-shot seed
      // message and drop the response stream — chat UI subscribes via the
      // streaming hook once the tab mounts.
      const message =
        `Please resume draft ${draft.draftId} ("${displayTitle(draft)}"). ` +
        `Call course.start_drafting with this draftId to continue building it.`;
      const stream = client.session.send(handle.sessionId, message);
      // Drain in the background — we don't need the events here; the chat
      // tab body will independently subscribe.
      (async () => {
        try {
          for await (const _ of stream) {
            // discard
          }
        } catch {
          // ignore — chat UI surfaces errors
        }
      })();
    } catch (_err) {
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
          <>
            <ResumeDraftPicker onResume={handleResumeDraft} />
            <button type="button" className={styles.newCourseBtn} onClick={handleNewCourse}>
              + New course
            </button>
          </>
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
