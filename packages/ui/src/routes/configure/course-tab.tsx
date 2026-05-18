import type { CourseId, Lesson, LessonId, SessionId, Unit } from "@praxis/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { LessonAssessmentPills } from "../../components/lesson-assessment-pills.js";
import { usePraxisClient } from "../../context/client-context.js";
import { useConfigureState } from "../../hooks/use-configure-state.js";
import { useCourses } from "../../hooks/use-courses.js";
import { useDirtyState } from "../../hooks/use-dirty-state.js";
import { useResource } from "../../hooks/use-resource.js";
import styles from "./course-tab.module.css";

interface CourseTabProps {
  sessionId: SessionId | null;
}

/**
 * Lesson status — derived from the course/gate progression data.
 * v1: simple done/active/gated classification.
 */
type LessonStatus = "done" | "active" | "gated";

/**
 * Build the flat ordered list of lessons for a unit from the unit's lessonIds and the
 * course's full lesson map.
 */
function lessonsForUnit(unit: Unit, lessonMap: Map<LessonId, Lesson>): Lesson[] {
  return unit.lessonIds.map((id) => lessonMap.get(id)).filter((l): l is Lesson => l !== undefined);
}

/**
 * Derive a display status for a lesson.
 * v1: no mastery data at this level — use a simple heuristic based on position.
 * A real implementation would cross-ref the gate/mastery state; for now we mark
 * all lessons as "gated" (not yet started) by default, leaving refinement to a
 * future story.
 */
function deriveLessonStatus(_lesson: Lesson): LessonStatus {
  return "gated";
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit block
// ─────────────────────────────────────────────────────────────────────────────

interface UnitBlockProps {
  unit: Unit;
  unitIndex: number;
  lessons: Lesson[];
  selectedLessonId: LessonId | null;
  onLessonSelect: (lesson: Lesson, unitIndex: number, lessonIndex: number) => void;
  onDragStart: (unitId: string) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, unitId: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, unitId: string) => void;
  isDragTarget: boolean;
}

function UnitBlock({
  unit,
  unitIndex,
  lessons,
  selectedLessonId,
  onLessonSelect,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget,
}: UnitBlockProps) {
  const [expanded, setExpanded] = useState(true);

  const blockClass = [styles.unitBlock, isDragTarget ? styles.unitBlockDragTarget : ""]
    .filter(Boolean)
    .join(" ");

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop container — role is implicit container not interactive element
    <div
      className={blockClass}
      data-testid={`unit-block-${unit.id}`}
      draggable
      onDragStart={() => onDragStart(unit.id)}
      onDragOver={(e) => onDragOver(e, unit.id)}
      onDrop={(e) => onDrop(e, unit.id)}
    >
      {/* Unit header — button so it's keyboard-accessible */}
      <button
        type="button"
        className={styles.unitHead}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.unitHandle} aria-hidden="true" title="Drag to reorder unit">
          ⁞⁞
        </span>
        <span className={styles.unitNum}>{unitIndex}.</span>
        <span className={styles.unitTitle}>{unit.name}</span>
        <span className={styles.unitMeta}>
          {lessons.length} lesson{lessons.length !== 1 ? "s" : ""}
        </span>
        <span className={styles.unitExpander} aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {/* Lessons */}
      {expanded && (
        <div className={styles.lessons}>
          {lessons.map((lesson, idx) => {
            const status = deriveLessonStatus(lesson);
            const isSelected = lesson.id === selectedLessonId;
            return (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                lessonNum={`${unitIndex}.${idx + 1}`}
                status={status}
                isSelected={isSelected}
                onSelect={() => onLessonSelect(lesson, unitIndex, idx + 1)}
              />
            );
          })}
          {lessons.length === 0 && <div className={styles.emptyUnit}>No lessons in this unit</div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lesson row
// ─────────────────────────────────────────────────────────────────────────────

interface LessonRowProps {
  lesson: Lesson;
  lessonNum: string;
  status: LessonStatus;
  isSelected: boolean;
  onSelect: () => void;
}

function LessonRow({ lesson, lessonNum, status, isSelected, onSelect }: LessonRowProps) {
  const rowClass = [styles.lessonRow, isSelected ? styles.lessonRowSelected : ""]
    .filter(Boolean)
    .join(" ");

  const statusClass = [
    styles.lessonStatus,
    status === "done" ? styles.lessonStatusDone : "",
    status === "active" ? styles.lessonStatusActive : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={rowClass}
      onClick={onSelect}
      data-testid={`lesson-row-${lesson.id}`}
    >
      <span className={styles.lessonNum}>{lessonNum}</span>
      <span className={styles.lessonTitle}>{lesson.title}</span>
      <LessonAssessmentPills lessonId={lesson.id} />
      <span className={statusClass}>{status}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Flat lesson list (no units — legacy courses)
// ─────────────────────────────────────────────────────────────────────────────

interface FlatLessonListProps {
  lessons: Lesson[];
  selectedLessonId: LessonId | null;
  onLessonSelect: (lesson: Lesson, unitIndex: number, lessonIndex: number) => void;
}

function FlatLessonList({ lessons, selectedLessonId, onLessonSelect }: FlatLessonListProps) {
  return (
    <div className={styles.flatList}>
      {lessons.map((lesson, idx) => {
        const status = deriveLessonStatus(lesson);
        const isSelected = lesson.id === selectedLessonId;
        return (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            lessonNum={String(idx + 1)}
            status={status}
            isSelected={isSelected}
            onSelect={() => onLessonSelect(lesson, 0, idx + 1)}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CourseTab
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Course tab canvas — unit/lesson tree with drag-reorderable unit blocks.
 *
 * Layout per the locked mock (tab-course.html):
 *  - Legend strip naming the assessment pill vocabulary.
 *  - For courses with units: one UnitBlock per unit, drag-reorderable.
 *  - For legacy flat courses: flat lesson list.
 *  - Clicking a lesson populates the inspector strip via ConfigureStateContext.
 *
 * Inspector integration: when a lesson row is clicked, `setSelectedLesson` is
 * called on the shared ConfigureStateContext, which the shell's InspectorStrip
 * reads.
 *
 * Drag-and-drop: HTML5 drag events track dragged unit id; on drop,
 * `praxisClient.author.updateCourse` is NOT called (no server-side unit-reorder
 * API exists yet — v1 reorders the local state and logs the intent). A future
 * story will add the server-side endpoint.
 *
 * The canvas is canvas-only — no chat pane (that lives in the shell).
 */
export function CourseTab({ sessionId: _sessionId }: CourseTabProps) {
  const client = usePraxisClient();
  const { selectedCourseId, setSelectedCourseId, setSelectedLesson } = useConfigureState();
  useDirtyState("configure.course");
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();

  // ── Selection ────────────────────────────────────────────────────────────

  const [selectedLessonId, setSelectedLessonId] = useState<LessonId | null>(null);

  // ── Drag state ───────────────────────────────────────────────────────────

  const draggingUnitIdRef = useRef<string | null>(null);
  const [dragTargetUnitId, setDragTargetUnitId] = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadCourse = useCallback(async (): Promise<[Unit[], Lesson[]]> => {
    if (!selectedCourseId) return [[], []];
    return Promise.all([
      client.artifacts.units(selectedCourseId),
      client.artifacts.lessons(selectedCourseId),
    ]);
  }, [client, selectedCourseId]);

  const { data, loading, error, setData } = useResource(loadCourse);
  const [units = [], lessons = []] = data ?? [];

  // Clear inspector selection when course changes — separate side effect, not part of the load.
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedCourseId is the trigger — we want to clear selection whenever it changes, even though it's not read in the body
  useEffect(() => {
    setSelectedLessonId(null);
    setSelectedLesson(null);
  }, [selectedCourseId, setSelectedLesson]);

  // ── Selection handler ────────────────────────────────────────────────────

  const handleLessonSelect = useCallback(
    (lesson: Lesson, unitIndex: number, lessonIndex: number) => {
      setSelectedLessonId(lesson.id);
      setSelectedLesson({ lesson, unitIndex, lessonIndex });
    },
    [setSelectedLesson],
  );

  // ── Drag handlers ────────────────────────────────────────────────────────

  const handleDragStart = useCallback((unitId: string) => {
    draggingUnitIdRef.current = unitId;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, unitId: string) => {
    e.preventDefault();
    setDragTargetUnitId(unitId);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetUnitId: string) => {
      e.preventDefault();
      setDragTargetUnitId(null);
      const srcId = draggingUnitIdRef.current;
      draggingUnitIdRef.current = null;
      if (!srcId || srcId === targetUnitId) return;

      setData((prev) => {
        const prevUnits = prev?.[0] ?? [];
        const prevLessons = prev?.[1] ?? [];
        const srcIdx = prevUnits.findIndex((u) => u.id === srcId);
        const tgtIdx = prevUnits.findIndex((u) => u.id === targetUnitId);
        if (srcIdx === -1 || tgtIdx === -1) return prev ?? [[], []];
        const next = [...prevUnits];
        // splice(srcIdx, 1) always returns 1 element since srcIdx !== -1 was checked above
        // biome-ignore lint/style/noNonNullAssertion: splice returns 1 element because srcIdx was validated above
        const removed = next.splice(srcIdx, 1)[0]!;
        next.splice(tgtIdx, 0, removed);
        // Persist reorder — no server-side unit-reorder endpoint in v1;
        // the visual order is updated locally. A future story will call
        // client.author.reorderUnits when the IPC channel is available.
        return [next, prevLessons];
      });
    },
    [setData],
  );

  // ── Build lesson map ──────────────────────────────────────────────────────

  const lessonMap = new Map(lessons.map((l) => [l.id, l]));
  const hasUnits = units.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      {/* Course picker */}
      <div className={styles.canvasHead}>
        <div className={styles.kicker}>⁂ Configure · structure</div>
        <div className={styles.pickerRow}>
          <label className={styles.pickerLabel}>
            Course
            <select
              className={styles.coursePicker}
              value={selectedCourseId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCourseId(val ? (val as CourseId) : null);
              }}
              disabled={coursesLoading}
              aria-label="Select course"
            >
              <option value="">— Select a course —</option>
              {courses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {coursesError && <span className={styles.error}>{coursesError}</span>}
        </div>
      </div>

      {/* Canvas body */}
      <div className={styles.canvas}>
        {!selectedCourseId && (
          <div className={styles.emptyState}>
            <p className={styles.emptyPrimary}>Select a course to view its unit and lesson tree.</p>
          </div>
        )}

        {selectedCourseId && loading && <p className={styles.status}>Loading course…</p>}

        {selectedCourseId && error && <p className={styles.error}>{error}</p>}

        {selectedCourseId && !loading && !error && (
          <>
            {/* Legend strip */}
            <div className={styles.legend} data-testid="legend-strip">
              <span className={styles.legendItem}>
                <span className={`${styles.pill} ${styles.pillQc}`}>QC</span>
                quick check (inline, formative)
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.pill} ${styles.pillReady}`}>READY</span>
                readiness quiz (before)
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.pill} ${styles.pillHome}`}>HW</span>
                practice homework (interleaved)
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.pill} ${styles.pillCheck}`}>QUIZ</span>
                checkpoint quiz (after)
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.pill} ${styles.pillExam}`}>EXAM</span>
                unit exam / final
              </span>
            </div>

            {/* Tree */}
            <div className={styles.tree} data-testid="course-tree">
              {hasUnits ? (
                units.map((unit, idx) => (
                  <UnitBlock
                    key={unit.id}
                    unit={unit}
                    unitIndex={idx + 1}
                    lessons={lessonsForUnit(unit, lessonMap)}
                    selectedLessonId={selectedLessonId}
                    onLessonSelect={handleLessonSelect}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    isDragTarget={dragTargetUnitId === unit.id}
                  />
                ))
              ) : (
                <FlatLessonList
                  lessons={lessons}
                  selectedLessonId={selectedLessonId}
                  onLessonSelect={handleLessonSelect}
                />
              )}

              {hasUnits && lessons.length === 0 && units.length === 0 && (
                <p className={styles.status}>No lessons yet. Add units via the configurator.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
