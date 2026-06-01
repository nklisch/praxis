/**
 * Exam modality tab body — proctored chrome.
 *
 * Visual contract: `.mockups/screens/epic-ui-redesign-ground-up-chat-workspace/mode-exam.html`
 *
 * Chrome:
 * - Adds `exam-mode` class to `document.documentElement` on mount; removes on unmount.
 *   Global CSS uses this to dim the surrounding nav (opacity 0.4, pointer-events none).
 * - Running header: exam-mode strip (pulse dot + "† Exam · proctored") + timer.
 * - Auto-submit at expiry (timer logic from sibling story — preserved exactly).
 *
 * Layout: two-column grid — main exam content (left) + item-status rail (right, 280px).
 *
 * Rubric: for free-response items (and math/code/numerical with workRubric), the
 * pre-committed rubric renders as a per-criterion card with weighted-sum display.
 *
 * Tool suppression: the item rail shows the "† tools allowed in exam" panel,
 * making the strict subset explicit to the student. The clarification affordance
 * is rendered via <ClarificationPill> in the action strip.
 */
import type {
  Assignment,
  AssignmentId,
  AssignmentItem,
  FreeResponseItem,
  Rubric,
  SessionId,
  SessionTabSummary,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { type JSX, useEffect, useRef, useState } from "react";
import { useActionEscalation } from "../hooks/use-action-escalation.js";
import { useAssignment } from "../hooks/use-assignment.js";
import { useOptimisticAction } from "../hooks/use-optimistic-action.js";
import { COPY } from "../lib/copy.js";
import { ActionPip } from "./action-pip.js";
import { AssignmentCard } from "./assignment-card.js";
import { ClarificationPill } from "./clarification-pill.js";
import styles from "./exam-tab-body.module.css";
import { FailurePopover } from "./failure-popover.js";

export interface ExamTabBodyProps {
  tab: SessionTabSummary;
}

// ─── Timer helpers ─────────────────────────────────────────────────────────────

function formatMmSs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const WARN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function computeRemainingMs(assignment: Assignment): number | null {
  if (!assignment.durationMinutes) return null;
  const expiresAt = assignment.assignedAt + assignment.durationMinutes * 60 * 1000;
  return expiresAt - Date.now();
}

// ─── Countdown component ───────────────────────────────────────────────────────

interface CountdownProps {
  assignment: Assignment;
  onExpiry: () => void;
}

function ExamCountdown({ assignment, onExpiry }: CountdownProps): JSX.Element | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    computeRemainingMs(assignment),
  );
  // Track whether we've already fired the expiry callback to avoid double-fire.
  const expiredRef = useRef(false);
  // Hold a stable reference to the callback so the interval closure stays fresh.
  const onExpiryRef = useRef(onExpiry);
  onExpiryRef.current = onExpiry;

  useEffect(() => {
    if (!assignment.durationMinutes) return;

    const tick = () => {
      const remaining = computeRemainingMs(assignment);
      setRemainingMs(remaining);
      if (remaining !== null && remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpiryRef.current();
      }
    };

    // Fire immediately so the display is right on mount.
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [assignment]);

  if (remainingMs === null) return null;

  const isWarn = remainingMs < WARN_THRESHOLD_MS;
  const displayMs = Math.max(0, remainingMs);

  return (
    <span
      className={isWarn ? styles.timerWarn : styles.timer}
      aria-live="off"
      data-testid="exam-timer"
    >
      {formatMmSs(displayMs)} left
    </span>
  );
}

// ─── Rubric component ──────────────────────────────────────────────────────────

interface RubricCardProps {
  rubric: Rubric;
}

/**
 * Pre-committed rubric card — per-criterion + weighted-sum display.
 * Visible during the exam (auditable transparency about grading criteria).
 */
function RubricCard({ rubric }: RubricCardProps): JSX.Element {
  return (
    <div className={styles.rubricCard} data-testid="rubric-card">
      <h3 className={styles.rubricHeading}>
        ⁂ rubric · pre-committed · {rubric.criteria.length} criteri
        {rubric.criteria.length === 1 ? "on" : "a"} · weighted sum to {rubric.maxScore} pts
      </h3>
      <div className={styles.rubricCriteria}>
        {rubric.criteria.map((crit) => {
          const pts = Math.round(crit.weight * rubric.maxScore * 10) / 10;
          return (
            <div key={crit.id} className={styles.critRow}>
              <span className={styles.critWeight}>
                {pts} pt{pts !== 1 ? "s" : ""}
              </span>
              <span className={styles.critDesc}>{crit.description}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.rubricHint}>
        rubric agent scores per-criterion (0–10) with rationale; final score is the deterministic
        weighted sum. Visible to you after submit.
      </p>
    </div>
  );
}

// ─── Item status rail ──────────────────────────────────────────────────────────

interface ItemRailProps {
  items: AssignmentItem[];
  currentIndex: number;
  responses: Map<string, string>;
  flagged: Set<string>;
  submitted: boolean;
  durationMinutes?: number | null | undefined;
  onSubmit: () => void;
  submitActionState: import("../hooks/use-optimistic-action.js").ActionState;
  submitErrorReason?: string | undefined;
  onRetrySubmit: () => void;
  onDismissSubmit: () => void;
}

function ItemRail({
  items,
  currentIndex,
  responses,
  flagged,
  submitted,
  durationMinutes,
  onSubmit,
  submitActionState,
  submitErrorReason,
  onRetrySubmit,
  onDismissSubmit,
}: ItemRailProps): JSX.Element {
  const answered = items.filter((item) => {
    const r = responses.get(item.id) ?? "";
    return r.trim().length > 0;
  }).length;
  const flaggedCount = flagged.size;
  const empty = items.length - answered - flaggedCount;

  return (
    <aside className={styles.rail} aria-label="Item status and exam tools">
      <h3 className={styles.railHeading}>Items · {items.length} total</h3>

      {/* Item status grid */}
      <div className={styles.itemGrid}>
        {items.map((item, i) => {
          const isDone = i < currentIndex || (responses.get(item.id) ?? "").trim().length > 0;
          const isCurrent = i === currentIndex;
          const isFlagged = flagged.has(item.id);
          const className = isCurrent
            ? styles.ixCurrent
            : isFlagged
              ? styles.ixFlagged
              : isDone
                ? styles.ixDone
                : styles.ix;
          return (
            <span key={item.id} className={className} title={`Item ${i + 1}`}>
              {i + 1}
            </span>
          );
        })}
      </div>
      <div className={styles.itemGridMeta}>
        {answered} done · {currentIndex < items.length ? "1 current" : "0 current"} ·{" "}
        {Math.max(0, items.length - answered - 1)} ahead
        {flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ""}
      </div>

      {/* Tools allowed */}
      <div className={styles.toolsAllowed} data-testid="tools-allowed">
        <h4 className={styles.toolsAllowedHeading}>† tools allowed in exam</h4>
        <div className={styles.toolRow}>
          <em>clarification</em> — rephrase a confusing prompt
        </div>
        <div className={styles.toolRow}>
          <em>assignment.show / read_grade</em>
        </div>
        <div className={styles.toolRow}>
          <em>sketch.read</em> — for visual items
        </div>
        <div className={`${styles.toolRow} ${styles.toolRowNo}`} data-testid="suppressed-tools">
          grade_math · tutor · retrieve_from_documents · hints
        </div>
      </div>

      {/* Submit strip */}
      {!submitted && (
        <div className={styles.submitStrip}>
          <h4 className={styles.submitStripHeading}>⁂ submit</h4>
          <div className={styles.submitRow}>
            <span>Answered</span>
            <span className={styles.submitVal}>
              {answered} / {items.length}
            </span>
          </div>
          <div className={styles.submitRow}>
            <span>Flagged</span>
            <span className={styles.submitVal}>{flaggedCount}</span>
          </div>
          <div className={styles.submitRow}>
            <span>Empty</span>
            <span className={styles.submitVal}>{Math.max(0, empty)}</span>
          </div>
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
            }}
          >
            <button type="button" className={styles.submitBtn} onClick={onSubmit}>
              Submit (early)
            </button>
            <ActionPip state={submitActionState} />
            {submitActionState === "failed" && (
              <FailurePopover
                reason={submitErrorReason}
                actions={[
                  { label: COPY.actionPip.retryLabel, onClick: onRetrySubmit, variant: "primary" },
                  { label: COPY.actionPip.dismissLabel, onClick: onDismissSubmit },
                ]}
              />
            )}
          </div>
          {durationMinutes && (
            <p className={styles.submitHint}>
              <em>Auto-submit at {durationMinutes}:00 elapsed.</em> Once submitted, grading runs and
              the tutor narrates results in the parent teach tab.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

// ─── Exam item renderer ────────────────────────────────────────────────────────

/**
 * Extract a rubric from any item kind that carries one.
 * Returns undefined when the item has no rubric.
 */
function getRubric(item: AssignmentItem): Rubric | undefined {
  if (item.kind === "free-response") return (item as FreeResponseItem).rubric;
  if (item.kind === "math" || item.kind === "code" || item.kind === "numerical")
    return item.workRubric;
  if (
    (item.kind === "single-choice" || item.kind === "multi-select" || item.kind === "two-tier") &&
    item.requireReasoning
  )
    return item.reasoningRubric;
  return undefined;
}

// ─── Mode rule banner ──────────────────────────────────────────────────────────

function ModeRuleBanner(): JSX.Element {
  return (
    <div className={styles.modeRule}>
      <div className={styles.modeRuleLabel}>⁂ exam mode is on</div>
      Tutor unavailable. <em>Only the clarification tool</em> is enabled — it rephrases a confusing
      prompt without revealing method or answer. No after-the-fact feedback during the exam; full
      grade summary lands after submit. Your work is saved every keystroke.
    </div>
  );
}

// ─── Main body ─────────────────────────────────────────────────────────────────

/**
 * Full-surface exam body. Chrome reduced (nav dimmed); exam-mode strip in header;
 * pre-committed rubric visible per free-response; strict tool subset in rail.
 */
export function ExamTabBody({ tab }: ExamTabBodyProps): JSX.Element {
  const sessionId = tab.sessionId as SessionId;
  const assignmentId = tab.assignmentId
    ? brandId<"AssignmentId">(tab.assignmentId as string)
    : undefined;

  // Load the assignment for timer + rubric access + submit.
  const { assignment, responses, submit } = useAssignment(assignmentId as AssignmentId | undefined);

  const [autoSubmitNotice, setAutoSubmitNotice] = useState(false);
  // Local submitted state (set after auto-submit fires before component has new assignment data).
  const [localSubmitted, setLocalSubmitted] = useState(false);
  // Track when the submit action failed so escalation can be time-keyed.
  const [failedAt, setFailedAt] = useState<number | null>(null);

  // ── Nav dimming: add exam-mode class to root element on mount ──────────────
  // Global CSS rule `.exam-mode .running-head nav` applies opacity 0.4 +
  // pointer-events: none to the nav links, matching the mock chrome reduction.
  useEffect(() => {
    document.documentElement.classList.add("exam-mode");
    return () => {
      document.documentElement.classList.remove("exam-mode");
    };
  }, []);

  const submitAction = useOptimisticAction<void>({
    dispatch: async () => {
      if (assignment?.submittedAt || localSubmitted) return;
      setLocalSubmitted(true);
      await submit();
    },
    onError: () => {
      // On error, revert the optimistic local-submitted state.
      setLocalSubmitted(false);
      setFailedAt(Date.now());
    },
  });

  // Escalate unattended failures to the activity strip after threshold.
  useActionEscalation({
    failedActions:
      submitAction.state === "failed" && failedAt !== null
        ? [{ id: "exam-submit", label: "Exam submit failed", failedAt }]
        : [],
    activity: null,
  });

  const handleManualSubmit = () => {
    submitAction.trigger();
  };

  const handleExpiry = async () => {
    if (assignment?.submittedAt || localSubmitted) return;
    setAutoSubmitNotice(true);
    setLocalSubmitted(true);
    await submit();
  };

  const isSubmitted = !!assignment?.submittedAt || localSubmitted;

  // Derive unique rubric items for display.
  const itemsWithRubric = (assignment?.items ?? []).filter((item) => getRubric(item) !== undefined);

  return (
    <div className={styles.container}>
      {/* Exam-mode strip in the kicker bar */}
      <div className={styles.kicker}>
        <span className={styles.examStrip}>
          <span className={styles.examPulse} aria-hidden="true" />†{" "}
          {tab.title ? `${tab.title} · proctored` : "Exam · proctored"}
        </span>
        {assignment && !assignment.submittedAt && (
          <ExamCountdown assignment={assignment} onExpiry={handleExpiry} />
        )}
        <span className={styles.kickerNotice}>chat is muted during the exam</span>
      </div>

      {/* Auto-submit notice */}
      {autoSubmitNotice && (
        <div className={styles.autoSubmitNotice} role="status">
          Time&apos;s up — auto-submitted.
        </div>
      )}

      {/* Two-column layout: main exam content + item rail */}
      <div className={styles.surface}>
        <main className={styles.examMain}>
          {assignmentId ? (
            <>
              {/* Exam head */}
              <header className={styles.examHead}>
                <div className={styles.examKicker}>
                  <span className={styles.examKickerDot} aria-hidden="true" />†{" "}
                  {tab.title ? `${tab.title} · proctored exam` : "Exam"}
                </div>
                <h1 className={styles.examTitle}>{assignment?.title ?? tab.title}</h1>
                {assignment && (
                  <div className={styles.examDeck}>
                    {assignment.items.length} item
                    {assignment.items.length !== 1 ? "s" : ""}
                    {assignment.durationMinutes ? ` · ${assignment.durationMinutes} min total` : ""}
                    {itemsWithRubric.length > 0 ? " · pre-committed rubric per free-response" : ""}
                    {assignment.durationMinutes
                      ? ` · auto-submit at ${assignment.durationMinutes} min`
                      : ""}
                  </div>
                )}
              </header>

              <ModeRuleBanner />

              {/* Assignment items — delegate to existing AssignmentCard for item I/O */}
              <div className={styles.assignmentWrap}>
                <AssignmentCard assignmentId={assignmentId} examLockdown={!isSubmitted} />
              </div>

              {/* Per-item rubric display (free-response + workRubric kinds) */}
              {itemsWithRubric.length > 0 && !isSubmitted && (
                <section className={styles.rubricSection} aria-label="Pre-committed rubrics">
                  <h2 className={styles.rubricSectionHeading}>Pre-committed rubrics</h2>
                  {itemsWithRubric.map((item) => {
                    const rubric = getRubric(item);
                    if (!rubric) return null;
                    // StructuredQuestionItem has no top-level prompt; all rubric-bearing
                    // item kinds (free-response, math, code, numerical, single-choice,
                    // multi-select, two-tier) do have prompt.
                    const itemPrompt = item.kind !== "structured-question" ? item.prompt : null;
                    return (
                      <div key={item.id} className={styles.rubricItem}>
                        {itemPrompt && (
                          <div className={styles.rubricItemMeta}>
                            <span className={styles.rubricItemPrompt}>{itemPrompt}</span>
                          </div>
                        )}
                        <RubricCard rubric={rubric} />
                      </div>
                    );
                  })}
                </section>
              )}

              {/* Clarification affordance */}
              <div className={styles.clarificationWrap}>
                <ClarificationPill sessionId={sessionId} />
              </div>
            </>
          ) : (
            <div className={styles.noAssignment}>
              <p>no assignment is linked to this session.</p>
            </div>
          )}
        </main>

        {/* Right rail — item index + tools + submit */}
        {assignment && (
          <ItemRail
            items={assignment.items}
            currentIndex={0}
            responses={responses}
            flagged={new Set()}
            submitted={isSubmitted}
            durationMinutes={assignment.durationMinutes}
            onSubmit={handleManualSubmit}
            submitActionState={submitAction.state}
            submitErrorReason={submitAction.errorReason}
            onRetrySubmit={submitAction.retry}
            onDismissSubmit={submitAction.dismiss}
          />
        )}
      </div>
    </div>
  );
}
