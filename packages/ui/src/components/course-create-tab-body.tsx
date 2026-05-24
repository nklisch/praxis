/**
 * Course-create mode tab body — Canvas + Side Chat layout.
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
 * drafter has produced unit scaffolding; it falls back to a flat lesson list
 * for pre-Phase-16 drafters.  `<LessonAssessmentPills>` decorates each lesson
 * row when proposed assessments are available.
 *
 * The "Add documents" affordance lives in the canvas header and opens
 * `<LibraryDocumentPicker>` scoped to the current session.
 *
 * **Materialize handoff** (course-create-entry-path story):
 * A "Confirm and open" CTA appears below the steering chat once the draft has
 * lessons.  Clicking sends a confirmation message to the agent; the agent calls
 * `course.confirm_draft` which fires a `finalized` draft-stream event. The
 * `useEffect` here catches that event, opens a teach session for the new
 * course, and navigates to the tab.
 */
import type {
  CourseId,
  ProposedLesson,
  ProposedLessonAssessmentEntry,
  ProposedUnit,
  SessionTabSummary,
} from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import {
  COURSE_CREATE_BUDGET_MAX,
  COURSE_CREATE_BUDGET_MIN,
  useCourseCreateBudget,
} from "../hooks/use-course-create-budget.js";
import { useDrafts } from "../hooks/use-drafts.js";
import { useResource } from "../hooks/use-resource.js";
import { useTabs } from "../hooks/use-tabs.js";
import { consumeInitialMessage, openSessionInTab } from "../lib/open-session-in-tab.js";
import { AuthoringChatPane } from "./authoring-chat-pane.js";
import styles from "./course-create-tab-body.module.css";
import { LessonAssessmentPills } from "./lesson-assessment-pills.js";
import { LibraryDocumentPicker } from "./library-document-picker.js";
import { SessionHead } from "./session-head.js";

export interface CourseCreateTabBodyProps {
  tab: SessionTabSummary;
}

/**
 * Course-create mode body: draft canvas on left, authoring chat on right.
 *
 * The canvas updates in real time via the draft stream.  The chat pane is
 * `<AuthoringChatPane mode="course-create">` which handles tool-call entries and
 * inline sub-agent blocks — no additional wiring needed here.
 */
export function CourseCreateTabBody({ tab }: CourseCreateTabBodyProps): JSX.Element {
  const client = usePraxisClient();
  const navigate = useNavigate();
  const { openTab } = useTabs();
  const { current } = useDrafts();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Tracks finalization in-flight so we don't double-open.
  const materializingRef = useRef(false);

  // Attached documents for this session-scope — refreshed after each attach.
  const attachedLoader = useCallback(
    () => client.documentScopes.listForScope({ kind: "session", id: tab.sessionId }),
    [client, tab.sessionId],
  );
  const { data: attachedDocs, refresh: refreshAttached } = useResource(attachedLoader);

  // Consume any pending initial message stored by openSessionInTab before navigation.
  // This is the user's context text from the /course-create form. Stored by
  // openSessionInTab, read once on mount via useState initializer, then passed to
  // AuthoringChatPane as prefillMessage so it sends through the pane's own
  // useStreamedSend — engine events flow to the UI correctly.
  // biome-ignore lint/correctness/useExhaustiveDependencies: consumeInitialMessage is a pure module fn with no reactive deps; tab.sessionId is stable per tab instance
  const [startupPrefill] = useState(() => consumeInitialMessage(tab.sessionId));

  // ── Finalization handler — open first teach session on draft finalized ────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: client.drafts.events is a stable method ref; subscribing once per tab session is intentional
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for await (const event of client.drafts.events()) {
        if (cancelled) break;
        if (event.kind === "finalized") {
          if (materializingRef.current) break;
          materializingRef.current = true;
          try {
            await openSessionInTab({
              client,
              navigate,
              openTab,
              startOpts: {
                modeId: "teach",
                courseId: event.courseId as CourseId,
              },
            });
          } catch {
            // Non-fatal — student can open a session from the library.
          }
          break;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab.sessionId, client, navigate, openTab]);

  const proposed = current?.proposed ?? null;
  // Show the confirm card once there's at least one lesson drafted.
  const draftReady =
    proposed != null &&
    (proposed.proposedLessons.length > 0 || (proposed.proposedUnits ?? []).length > 0);

  const handleConfirmAndOpen = () => {
    // Delegate to the agent via the AuthoringChatPane's send path so the
    // confirmation message appears in the chat transcript.
    // The finalization useEffect above catches the draft-stream `finalized` event
    // and opens the first teach session automatically.
    setConfirming(true);
  };

  return (
    <div className={styles.container}>
      {/* Left: draft canvas — live outline driven by the course-create drafts stream. */}
      <div className={styles.draftCanvas}>
        <SessionHead modeId="course-create" title={tab.title} />
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

          {attachedDocs && attachedDocs.length > 0 && (
            <div className={styles.attachedDocsSection} data-testid="attached-docs-section">
              <p className={styles.attachedDocsKicker}>⊞ attached documents</p>
              <ul className={styles.attachedDocsList}>
                {attachedDocs.map((doc) => (
                  <li key={doc.documentId} className={styles.attachedDocRow}>
                    <span className={styles.attachedDocName}>{doc.filename}</span>
                    <span className={styles.attachedDocMeta}>
                      {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Right: authoring chat — parent-agent steer interface. */}
      <div className={styles.chatPanel}>
        {/* chatPaneWrap takes flex: 1 so the confirm card stays anchored below. */}
        <div className={styles.chatPaneWrap}>
          <AuthoringChatPane
            mode="course-create"
            sessionId={tab.sessionId}
            {...(startupPrefill !== undefined &&
              !confirming && {
                prefillMessage: startupPrefill,
              })}
            {...(confirming && {
              prefillMessage: "Please confirm the draft and open the course.",
              onPrefillSent: () => setConfirming(false),
            })}
          />
        </div>
        {/* Confirm card — shown when the draft has lessons, per mock step 4. */}
        {draftReady && (
          <div className={styles.confirmCard} data-testid="confirm-card">
            <h3 className={styles.confirmTitle}>
              Ready to <em>materialize</em>?
            </h3>
            <p className={styles.confirmLede}>
              Confirming creates the course in your library, sets up gates between lessons, and
              opens your first lesson.
            </p>
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={handleConfirmAndOpen}
              disabled={confirming}
            >
              {confirming ? "Asking Praxis to confirm…" : "Confirm and open ↗"}
            </button>
          </div>
        )}
      </div>

      {/* Session-scope library picker — opened from canvas header. */}
      {pickerOpen && (
        <LibraryDocumentPicker
          scope={{ kind: "session", id: tab.sessionId }}
          onClose={() => setPickerOpen(false)}
          onAttached={() => void refreshAttached()}
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
 * When the drafter has produced unit scaffolding (`proposedUnits` is
 * non-empty), renders units as titled blocks with their lesson rows inside.
 * Falls back to a flat lesson list for pre-Phase-16 drafters.
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
  const { maxSteps, saving, setMaxSteps } = useCourseCreateBudget();
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
        min={COURSE_CREATE_BUDGET_MIN}
        max={COURSE_CREATE_BUDGET_MAX}
        step={1}
        value={draft}
        disabled={maxSteps === null || saving}
        onChange={onChange}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Course-design budget"
        title={`Tool-call budget for the course-design sub-agent (${COURSE_CREATE_BUDGET_MIN}–${COURSE_CREATE_BUDGET_MAX} steps).`}
      />
      steps
    </label>
  );
}
