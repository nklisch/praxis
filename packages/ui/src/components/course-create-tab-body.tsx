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
import { useActionEscalation } from "../hooks/use-action-escalation.js";
import {
  COURSE_CREATE_BUDGET_MAX,
  COURSE_CREATE_BUDGET_MIN,
  useCourseCreateBudget,
} from "../hooks/use-course-create-budget.js";
import { useDrafts } from "../hooks/use-drafts.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { useOptimisticAction } from "../hooks/use-optimistic-action.js";
import { useResource } from "../hooks/use-resource.js";
import { useTabs } from "../hooks/use-tabs.js";
import { COPY } from "../lib/copy.js";
import { consumeInitialMessage, openSessionInTab } from "../lib/open-session-in-tab.js";
import { ActionPip } from "./action-pip.js";
import { AuthoringChatPane } from "./authoring-chat-pane.js";
import styles from "./course-create-tab-body.module.css";
import { FailurePopover } from "./failure-popover.js";
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
  // Whether the prefill message is being sent to the agent chat pane.
  const [confirming, setConfirming] = useState(false);
  // Tracks finalization in-flight so we don't double-open.
  const materializingRef = useRef(false);
  // Track when the confirm action failed so escalation can be time-keyed.
  const [confirmFailedAt, setConfirmFailedAt] = useState<number | null>(null);

  // Attached documents for this session-scope — refreshed after each attach.
  const attachedLoader = useCallback(
    () => client.documentScopes.listForScope({ kind: "session", id: tab.sessionId }),
    [client, tab.sessionId],
  );
  const { data: attachedDocs, refresh: refreshAttached } = useResource(attachedLoader);

  // Ingestion for the library picker — hoisted here so closing the picker does
  // not abort an in-flight batch (see bug-picker-close-aborts-ingestion).
  const pickerIngestion = useIngestion(
    () => {
      void refreshAttached();
    },
    { scope: { kind: "session", id: tab.sessionId } },
  );

  // Consume any pending initial message stored by openSessionInTab before navigation.
  // This is the user's context text from the /course-create form. Stored by
  // openSessionInTab, read once on mount via useState initializer, then passed to
  // AuthoringChatPane as prefillMessage so it sends through the pane's own
  // useStreamedSend — engine events flow to the UI correctly.
  const [startupPrefill] = useState(() => consumeInitialMessage(tab.sessionId));

  // ── Confirm action — optimistic dispatch with external settle ────────────────
  //
  // dispatch: fires the prefill message through the authoring chat pane, which
  // triggers the agent to call course.confirm_draft. Returns a Promise that
  // never self-resolves — settlement is driven externally by the draft-events
  // finalized event via externalSettle("success"). On error, externalSettle
  // ("failed", reason) is called from the error path.
  //
  // This pattern keeps the same hook surface as the other surfaces while
  // accommodating the streaming-event-driven completion signal.
  const confirmAction = useOptimisticAction<void>({
    dispatch: async () => {
      // Kick off the agent's confirm flow via the prefill message path.
      setConfirming(true);
      // The promise intentionally never self-resolves — externalSettle drives
      // the state transition when the finalized event arrives.
      await new Promise<void>(() => {});
    },
    onSuccess: () => {
      // onSuccess is triggered by externalSettle("success") below.
      // The teach session open already happened in the finalized-event handler.
    },
    onError: () => {
      setConfirmFailedAt(Date.now());
      // Revert the confirming state so the prefill message stops.
      setConfirming(false);
    },
  });

  // Escalate unattended failures to the activity strip after threshold.
  useActionEscalation({
    failedActions:
      confirmAction.state === "failed" && confirmFailedAt !== null
        ? [
            {
              id: "course-materialize",
              label: "Course materialize failed",
              failedAt: confirmFailedAt,
            },
          ]
        : [],
    activity: null,
  });

  // ── Finalization handler — open first teach session on draft finalized ────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: client.drafts.events is a stable method ref; subscribing once per tab session is intentional
  useEffect(() => {
    let cancelled = false;
    let returnStream: (() => void) | null = null;
    (async () => {
      const iterator = client.drafts.events()[Symbol.asyncIterator]();
      returnStream = () => {
        void Promise.resolve(iterator.return?.()).catch(() => {
          // Best-effort cancellation: the stream may already be closed.
        });
      };

      try {
        while (true) {
          const result = await iterator.next();
          if (result.done) break;
          const event = result.value;
          if (cancelled) break;
          if (event.kind === "finalized") {
            if (materializingRef.current) break;
            materializingRef.current = true;
            // Settle the confirmAction pip to success — onSuccess will fire.
            // (safe no-op if confirmAction is not in a pending/retrying state)
            confirmAction.externalSettle("success");
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
      } catch (err) {
        if (!cancelled) {
          confirmAction.externalSettle(
            "failed",
            err instanceof Error ? err.message : COPY.error.unknown,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      returnStream?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.sessionId, client, navigate, openTab]);

  const proposed = current?.proposed ?? null;
  // Show the confirm card once there's at least one lesson drafted.
  const draftReady =
    proposed != null &&
    (proposed.proposedLessons.length > 0 || (proposed.proposedUnits ?? []).length > 0);

  const handleConfirmAndOpen = () => {
    if (confirmAction.state === "pending" || confirmAction.state === "retrying") return;
    confirmAction.trigger();
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
            <div
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
            >
              <button type="button" className={styles.confirmBtn} onClick={handleConfirmAndOpen}>
                Confirm and open ↗
              </button>
              <ActionPip state={confirmAction.state} />
              {confirmAction.state === "failed" && (
                <FailurePopover
                  reason={confirmAction.errorReason}
                  actions={[
                    {
                      label: COPY.actionPip.retryLabel,
                      onClick: confirmAction.retry,
                      variant: "primary",
                    },
                    { label: COPY.actionPip.dismissLabel, onClick: confirmAction.dismiss },
                  ]}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Session-scope library picker — opened from canvas header. */}
      {pickerOpen && (
        <LibraryDocumentPicker
          scope={{ kind: "session", id: tab.sessionId }}
          onClose={() => setPickerOpen(false)}
          onAttached={() => void refreshAttached()}
          ingestion={pickerIngestion}
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
