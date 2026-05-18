/**
 * Bootstrap mode tab body — Canvas + Side Chat layout.
 *
 * Two-column layout per the locked mode-course-create.html mock:
 *   - Left (flex 1): draft canvas — live preview of units, lessons, and
 *     assessment plan as the course-design sub-agent builds the draft.
 *     Subscribes to `client.drafts.events()` via `useDrafts`.
 *   - Right (420px): `<AuthoringChatPane>` — the parent-agent chat surface
 *     where the user steers the draft.  Tool calls and sub-agent blocks render
 *     inline (via the pane's own rendering layer — no extra wiring here).
 *
 * The canvas renders `ProposedUnit` groups with their lessons when the
 * explorer has produced unit scaffolding; it falls back to a flat lesson list
 * for pre-Phase-16 explorers.  `<LessonAssessmentPills>` decorates each lesson
 * row when proposed assessments are available.
 *
 * The "Add documents" affordance lives in the canvas header and opens
 * `<LibraryDocumentPicker>` scoped to the current session.
 */
import type {
  ProposedLesson,
  ProposedLessonAssessmentEntry,
  ProposedUnit,
  SessionTabSummary,
} from "@praxis/core/types";
import { type ChangeEvent, type JSX, useEffect, useState } from "react";
import {
  BOOTSTRAP_BUDGET_MAX,
  BOOTSTRAP_BUDGET_MIN,
  useBootstrapBudget,
} from "../hooks/use-bootstrap-budget.js";
import { useDrafts } from "../hooks/use-drafts.js";
import { AuthoringChatPane } from "./authoring-chat-pane.js";
import styles from "./bootstrap-tab-body.module.css";
import { LessonAssessmentPills } from "./lesson-assessment-pills.js";
import { LibraryDocumentPicker } from "./library-document-picker.js";
import { SessionHead } from "./session-head.js";

export interface BootstrapTabBodyProps {
  tab: SessionTabSummary;
}

/**
 * Bootstrap mode body: draft canvas on left, authoring chat on right.
 *
 * The canvas updates in real time via the draft stream.  The chat pane is
 * `<AuthoringChatPane mode="bootstrap">` which handles tool-call entries and
 * inline sub-agent blocks — no additional wiring needed here.
 */
export function BootstrapTabBody({ tab }: BootstrapTabBodyProps): JSX.Element {
  const { current } = useDrafts();
  const [pickerOpen, setPickerOpen] = useState(false);

  const proposed = current?.proposed ?? null;

  return (
    <div className={styles.container}>
      {/* Left: draft canvas — live outline driven by the bootstrap-drafts stream. */}
      <div className={styles.draftCanvas}>
        <SessionHead modeId="bootstrap" title={tab.title} />
        <div className={styles.canvasHeader}>
          <span className={styles.canvasKicker}>¶ draft course</span>
          {proposed ? (
            <span className={styles.canvasTitle}>{proposed.title}</span>
          ) : (
            <span className={styles.canvasTitleEmpty}>course outline</span>
          )}
          {proposed && <span className={styles.draftBadge}>draft</span>}
          <button
            type="button"
            className={styles.addDocsBtn}
            onClick={() => setPickerOpen(true)}
            title="Add documents to this session"
          >
            Add documents
          </button>
          <BudgetField />
        </div>

        <div className={styles.canvasScroll} data-testid="draft-canvas-scroll">
          {proposed ? (
            <DraftCanvas proposed={proposed} />
          ) : (
            <div className={styles.canvasEmpty}>
              <p>the outline will appear here as the tutor builds the course.</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: authoring chat — parent-agent steer interface. */}
      <div className={styles.chatPanel}>
        <AuthoringChatPane mode="bootstrap" sessionId={tab.sessionId} />
      </div>

      {/* Session-scope library picker — opened from canvas header. */}
      {pickerOpen && (
        <LibraryDocumentPicker
          scope={{ kind: "session", id: tab.sessionId }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Draft canvas ──────────────────────────────────────────────────────────────

interface DraftCanvasProps {
  proposed: NonNullable<ReturnType<typeof useDrafts>["current"]>["proposed"];
}

/**
 * Renders the live draft preview.
 *
 * When the explorer has produced unit scaffolding (`proposedUnits` is
 * non-empty), renders units as titled blocks with their lesson rows inside.
 * Falls back to a flat lesson list for pre-Phase-16 explorers.
 */
function DraftCanvas({ proposed }: DraftCanvasProps): JSX.Element {
  const units = proposed.proposedUnits ?? [];
  const allLessons = proposed.proposedLessons;
  const allAssessments = proposed.proposedLessonAssessments ?? [];

  if (units.length > 0) {
    return (
      <div className={styles.unitList}>
        {units.map((unit, idx) => (
          <UnitBlock
            key={unit.draftUnitId}
            unit={unit}
            index={idx + 1}
            allLessons={allLessons}
            allAssessments={allAssessments}
          />
        ))}
        <div className={styles.canvasAddHint}>+ add a unit · or steer via chat →</div>
      </div>
    );
  }

  // Flat fallback: no units yet — render a flat lesson list.
  return (
    <div className={styles.lessonList}>
      {allLessons.map((lesson, idx) => (
        <LessonRow
          key={lesson.draftLessonId}
          lesson={lesson}
          index={idx + 1}
          assessments={allAssessments.filter((a) => a.draftLessonId === lesson.draftLessonId)}
        />
      ))}
    </div>
  );
}

// ── Unit block ────────────────────────────────────────────────────────────────

interface UnitBlockProps {
  unit: ProposedUnit;
  index: number;
  allLessons: ProposedLesson[];
  allAssessments: ProposedLessonAssessmentEntry[];
}

function UnitBlock({ unit, index, allLessons, allAssessments }: UnitBlockProps): JSX.Element {
  // Resolve lessons that belong to this unit, in order.
  const lessons = unit.draftLessonIds
    .map((id) => allLessons.find((l) => l.draftLessonId === id))
    .filter((l): l is ProposedLesson => l != null);

  return (
    <div className={styles.unitBlock} data-testid="unit-block">
      <div className={styles.unitHead}>
        <span className={styles.unitNum}>{index}.</span>
        <span className={styles.unitTitle}>{unit.name}</span>
        <span className={styles.unitMeta}>
          {lessons.length} lesson{lessons.length !== 1 ? "s" : ""}
          {unit.summative ? ` · ${unit.summative.kind}-after` : ""}
        </span>
      </div>
      <div className={styles.unitLessons}>
        {lessons.map((lesson, i) => (
          <LessonRow
            key={lesson.draftLessonId}
            lesson={lesson}
            index={i + 1}
            assessments={allAssessments.filter((a) => a.draftLessonId === lesson.draftLessonId)}
            unitIndex={index}
          />
        ))}
      </div>
    </div>
  );
}

// ── Lesson row ────────────────────────────────────────────────────────────────

interface LessonRowProps {
  lesson: ProposedLesson;
  index: number;
  assessments: ProposedLessonAssessmentEntry[];
  /** When rendering within a unit, prefix the label as U.L. */
  unitIndex?: number;
}

function LessonRow({ lesson, index, assessments, unitIndex }: LessonRowProps): JSX.Element {
  const label = unitIndex != null ? `${unitIndex}.${index}` : String(index);
  return (
    <div className={styles.lessonRow} data-testid="lesson-row">
      <span className={styles.lessonLabel}>{label}</span>
      <span className={styles.lessonTitle}>{lesson.title}</span>
      {assessments.length > 0 && (
        <span className={styles.lessonAssess}>
          <LessonAssessmentPills assessments={assessments} />
        </span>
      )}
    </div>
  );
}

// ── Budget field ──────────────────────────────────────────────────────────────

/**
 * Editable numeric input for the course-design sub-agent tool-call budget.
 * Local input state lets the user type freely; commits on blur or Enter.
 * Clamped client-side and again server-side by Zod.
 */
function BudgetField(): JSX.Element {
  const { maxSteps, saving, setMaxSteps } = useBootstrapBudget();
  const [draft, setDraft] = useState<string>("");

  // Sync local draft string when the loaded value arrives or changes externally.
  useEffect(() => {
    if (maxSteps !== null) setDraft(String(maxSteps));
  }, [maxSteps]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      void setMaxSteps(parsed);
    } else if (maxSteps !== null) {
      setDraft(String(maxSteps));
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  };

  return (
    <label className={styles.budgetField}>
      budget
      <input
        type="number"
        className={styles.budgetInput}
        min={BOOTSTRAP_BUDGET_MIN}
        max={BOOTSTRAP_BUDGET_MAX}
        step={1}
        value={draft}
        disabled={maxSteps === null || saving}
        onChange={onChange}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Course-design budget"
        title={`Tool-call budget for the course-design sub-agent (${BOOTSTRAP_BUDGET_MIN}–${BOOTSTRAP_BUDGET_MAX} steps).`}
      />
      steps
    </label>
  );
}
