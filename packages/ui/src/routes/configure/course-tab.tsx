import type { Course, Lesson, LessonId, SessionId } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { ConfigureChatPane } from "../../components/configure-chat-pane.js";
import { LessonEditor } from "../../components/lesson-editor.js";
import { usePraxisClient } from "../../context/client-context.js";
import { useConfigureState } from "../../hooks/use-configure-state.js";
import { useCourses } from "../../hooks/use-courses.js";
import styles from "./course-tab.module.css";

interface CourseTabProps {
  sessionId: SessionId | null;
}

/**
 * Course tab — split pane: chat (left) + course outline editor (right).
 *
 * Right side:
 *  - Course picker (dropdown from useCourses)
 *  - If course selected: list of lessons (each as LessonEditor), + Add lesson button
 *  - Edits flow through client.author.updateLesson / createLesson / deleteLesson
 *
 * No RouteHeader: this is a tab panel inside <ConfigureRoute>, not a standalone route.
 * The parent route owns the header (configure.tsx renders <RouteHeader>).
 */
export function CourseTab({ sessionId }: CourseTabProps) {
  const client = usePraxisClient();
  const { selectedCourseId, setSelectedCourseId } = useConfigureState();
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();

  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [concepts, setConcepts] = useState<
    Array<{ id: string; name: string; aliases: string[] }>
  >([]);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [addingLesson, setAddingLesson] = useState(false);

  const loadCourseSummary = useCallback(async () => {
    if (!selectedCourseId) {
      setCourse(null);
      setLessons([]);
      setConcepts([]);
      return;
    }
    setEditorLoading(true);
    setEditorError(null);
    try {
      const summary = await client.author.getCourseSummary(selectedCourseId);
      setCourse(summary.course);
      setLessons(summary.lessons);
      setConcepts(
        summary.concepts.map((c) => ({
          id: c.id,
          name: c.name,
          aliases: c.aliases,
        })),
      );
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditorLoading(false);
    }
  }, [client, selectedCourseId]);

  useEffect(() => {
    loadCourseSummary();
  }, [loadCourseSummary]);

  const handleLessonSaved = (updated: Lesson) => {
    setLessons((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleLessonDeleted = (lessonId: LessonId) => {
    setLessons((prev) => prev.filter((l) => l.id !== lessonId));
  };

  const handleAddLesson = async () => {
    if (!selectedCourseId) return;
    setAddingLesson(true);
    try {
      const newLesson = await client.author.createLesson({
        courseId: selectedCourseId,
        title: "New lesson",
        conceptIds: [],
      });
      setLessons((prev) => [...prev, newLesson]);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingLesson(false);
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.chatPane}>
        <ConfigureChatPane sessionId={sessionId} />
      </div>

      <div className={styles.editorPane}>
        <div className={styles.editorHeader}>
          <h2 className={styles.editorTitle}>Course Editor</h2>

          <div className={styles.pickerRow}>
            <label className={styles.pickerLabel}>
              Course
              <select
                className={styles.coursePicker}
                value={selectedCourseId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedCourseId(val ? (val as import("@praxis/core/types").CourseId) : null);
                }}
                disabled={coursesLoading}
              >
                <option value="">— Select a course —</option>
                {courses.map((c) => (
                  <option key={c.courseId} value={c.courseId}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {coursesError && <p className={styles.error}>{coursesError}</p>}
        </div>

        <div className={styles.editorContent}>
          {!selectedCourseId && (
            <div className={styles.emptyState}>
              <p className={styles.emptyPrimary}>Select a course to edit its lessons.</p>
            </div>
          )}

          {selectedCourseId && editorLoading && <p className={styles.status}>Loading course…</p>}

          {selectedCourseId && editorError && <p className={styles.error}>{editorError}</p>}

          {selectedCourseId && !editorLoading && !editorError && course && (
            <div className={styles.lessonList}>
              <div className={styles.courseHeader}>
                <h3 className={styles.courseName}>{course.title}</h3>
                <span className={styles.courseMeta}>
                  {course.subject} · {course.gradeLevel}
                </span>
              </div>

              {lessons.length === 0 && (
                <p className={styles.status}>No lessons yet. Add the first one below.</p>
              )}

              {lessons.map((lesson) => (
                <LessonEditor
                  key={lesson.id}
                  lesson={lesson}
                  availableConcepts={concepts}
                  onSaved={handleLessonSaved}
                  onDeleted={handleLessonDeleted}
                />
              ))}

              <button
                type="button"
                className={styles.addBtn}
                onClick={handleAddLesson}
                disabled={addingLesson}
              >
                {addingLesson ? "Adding…" : "+ Add lesson"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
