/**
 * Homework tab body — paginated multi-item batch.
 *
 * Layout: three-column grid matching the locked mode-homework.html mock.
 *   - Left (200px): page-nav with per-item status (done/skip/flag/empty).
 *   - Center (flex-1): item card with work-area tabs (typed/show-work/sketch),
 *     ask-for-clarification row, per-item action bar.
 *   - Right (280px): submit card with stats (answered/skipped/flagged/empty),
 *     save-and-close, final submit (gated until no empty items remain or
 *     student explicitly chooses to submit early).
 *
 * Homework-mode discipline:
 *   - Agent answers item-meaning questions only (no solutions). The
 *     SidekickPanel carries the homework modeId; the brief constrains
 *     the model on the backend. No additional suppression needed here.
 *   - Full feedback (AssignmentFeedback) is shown only after submission.
 *   - Per-item state (saved / skipped / flagged) is persisted via
 *     useAssignment's recordResponse (debounced auto-save). Skipped and
 *     flagged items are tracked in local state; they don't produce a
 *     separate API field — the response text is the save signal.
 */
import type {
  AssignmentItem,
  AssignmentSubmissionResult,
  SessionTabSummary,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { JSX } from "react";
import { useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useAssignment } from "../hooks/use-assignment.js";
import { AssignmentFeedback } from "./assignment-feedback.js";
import { AssignmentItemCard } from "./assignment-item-card.js";
import styles from "./homework-tab-body.module.css";
import type { SketchCanvasHandle } from "./sketch-canvas.js";

export interface HomeworkTabBodyProps {
  tab: SessionTabSummary;
}

type WorkTab = "typed" | "show-work" | "sketch";

/**
 * Per-item save status shown in the page nav and submit card stats.
 */
type ItemSaveStatus = "answered" | "skipped" | "flagged" | "empty";

/**
 * Full-surface homework body.
 *
 * Three-column layout: page-nav left · item main · submit rail right.
 */
export function HomeworkTabBody({ tab }: HomeworkTabBodyProps): JSX.Element {
  const assignmentId = tab.assignmentId ? brandId<"AssignmentId">(tab.assignmentId) : undefined;

  const client = usePraxisClient();

  const {
    assignment,
    responses,
    work,
    loading,
    error,
    submitting,
    submitError,
    recordResponse,
    submit,
  } = useAssignment(assignmentId);

  // Current item index within the assignment's items list.
  const [currentIndex, setCurrentIndex] = useState(0);

  // Per-item skipped / flagged sets (by itemId).
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  // Active work-area tab per item (keyed by itemId). Falls back to "typed".
  const [workTabs, setWorkTabs] = useState<Map<string, WorkTab>>(new Map());

  // Final submission result (shown after submit — reveals feedback).
  const [submitResult, setSubmitResult] = useState<AssignmentSubmissionResult | null>(null);

  // Sketch handle refs — forwarded from math items to capture on final submit.
  const sketchHandleRefs = useRef<Map<string, SketchCanvasHandle | null>>(new Map());

  const items: AssignmentItem[] = assignment?.items ?? [];
  const totalItems = items.length;
  const isSubmitted = !!(assignment?.grade ?? submitResult?.grade);
  const grade = submitResult?.grade ?? assignment?.grade ?? null;

  // ── Per-item status ──────────────────────────────────────────────────────

  function itemSaveStatus(item: AssignmentItem): ItemSaveStatus {
    const hasResponse = (responses.get(item.id) ?? "") !== "";
    if (hasResponse) return "answered";
    if (skipped.has(item.id)) return "skipped";
    if (flagged.has(item.id)) return "flagged";
    return "empty";
  }

  // ── Stats for the submit card ────────────────────────────────────────────

  const answeredCount = items.filter((item) => (responses.get(item.id) ?? "") !== "").length;
  const skippedCount = items.filter(
    (item) => skipped.has(item.id) && (responses.get(item.id) ?? "") === "",
  ).length;
  const flaggedCount = items.filter(
    (item) =>
      flagged.has(item.id) && (responses.get(item.id) ?? "") === "" && !skipped.has(item.id),
  ).length;
  const emptyCount = totalItems - answeredCount - skippedCount - flaggedCount;

  // Progress percentage based on answered items.
  const progressPct = totalItems > 0 ? (answeredCount / totalItems) * 100 : 0;

  // ── Navigation ───────────────────────────────────────────────────────────

  function goTo(idx: number) {
    if (idx >= 0 && idx < totalItems) setCurrentIndex(idx);
  }

  function handlePrev() {
    goTo(currentIndex - 1);
  }

  // ── Per-item actions ─────────────────────────────────────────────────────

  function handleSaveAndNext() {
    // Response is auto-saved by recordResponse's debounce; navigation is the
    // explicit user action. Move to next item.
    goTo(currentIndex + 1);
  }

  function handleSkip() {
    const item = items[currentIndex];
    if (!item) return;
    setSkipped((prev) => new Set([...prev, item.id]));
    goTo(currentIndex + 1);
  }

  function handleFlag() {
    const item = items[currentIndex];
    if (!item) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
  }

  // ── Final submit ─────────────────────────────────────────────────────────

  async function handleFinalSubmit() {
    if (!assignment) return;
    // Capture sketches for any math items that have drawings.
    for (const item of assignment.items) {
      if (item.kind !== "math") continue;
      const handle = sketchHandleRefs.current.get(item.id);
      if (!handle) continue;
      try {
        const captured = await handle.capture();
        if (captured.width === 0) continue;
        const summary = await client.sketches.put({
          snapshot: captured.snapshot,
          image: captured.image,
          width: captured.width,
          height: captured.height,
        });
        if (!assignmentId) continue;
        const existingWork = work.get(item.id) ?? "";
        await client.assignments
          .recordResponse({
            assignmentId,
            itemId: item.id,
            response: responses.get(item.id) ?? "",
            ...(existingWork.trim() && { work: existingWork }),
            sketchId: summary.id as string,
          })
          .catch(() => {});
      } catch {
        // Sketch capture failure is non-fatal.
      }
    }

    const result = await submit();
    if (result) {
      setSubmitResult(result);
      setCurrentIndex(0);
    }
  }

  // ── Work tab per item ────────────────────────────────────────────────────

  function getWorkTab(itemId: string): WorkTab {
    return workTabs.get(itemId) ?? "typed";
  }

  function setWorkTab(itemId: string, tab: WorkTab) {
    setWorkTabs((prev) => new Map(prev).set(itemId, tab));
  }

  // ── Early-exit renders ───────────────────────────────────────────────────

  if (!tab.assignmentId) {
    return (
      <div className={styles.container}>
        <HomeworkHead tab={tab} answeredCount={0} totalItems={0} progressPct={0} />
        <div className={styles.noAssignment}>
          <p>no assignment is linked to this session.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <HomeworkHead tab={tab} answeredCount={0} totalItems={0} progressPct={0} />
        <div className={styles.noAssignment}>
          <p className={styles.loadingText}>Loading homework…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <HomeworkHead tab={tab} answeredCount={0} totalItems={0} progressPct={0} />
        <div className={styles.noAssignment}>
          <p className={styles.errorText}>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className={styles.container}>
        <HomeworkHead tab={tab} answeredCount={0} totalItems={0} progressPct={0} />
        <div className={styles.noAssignment}>
          <p>no assignment found.</p>
        </div>
      </div>
    );
  }

  const currentItem = items[currentIndex];

  return (
    <div className={styles.container}>
      <HomeworkHead
        tab={tab}
        answeredCount={answeredCount}
        totalItems={totalItems}
        progressPct={progressPct}
      />

      <div className={styles.surface}>
        {/* ── Left: paginated item nav ── */}
        <aside className={styles.pageNav} aria-label="Homework items">
          <h3 className={styles.pageNavHead}>Items · {totalItems} total</h3>
          <ul className={styles.pageList}>
            {items.map((item, idx) => {
              const status = isSubmitted ? "answered" : itemSaveStatus(item);
              const isCurrent = idx === currentIndex && !isSubmitted;
              const prompt =
                "prompt" in item ? String((item as { prompt: string }).prompt) : `Item ${idx + 1}`;
              const shortTitle = prompt.length > 24 ? `${prompt.slice(0, 24)}…` : prompt;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.pageRow}${isCurrent ? ` ${styles.pageRowCurrent}` : ""}`}
                    onClick={() => !isSubmitted && goTo(idx)}
                    aria-current={isCurrent ? "true" : undefined}
                    aria-label={`Item ${idx + 1}: ${shortTitle} — ${status}`}
                  >
                    <span className={styles.pageNum}>{idx + 1}</span>
                    <span className={styles.pageTitle}>{shortTitle}</span>
                    <PageStatusPill status={status} />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Center: active item ── */}
        <main className={styles.main}>
          {/* Mode rule banner */}
          {!isSubmitted && (
            <div className={styles.modeRule}>
              <em>This is homework mode.</em> Praxis can clarify what an item <em>asks for</em> —
              but won&apos;t reveal a solution. Full feedback comes after you submit the whole set.
              Save and come back anytime.
            </div>
          )}

          {/* ── In-progress: current item card ── */}
          {!isSubmitted && currentItem && (
            <ItemPanel
              item={currentItem}
              index={currentIndex}
              totalItems={totalItems}
              response={responses.get(currentItem.id) ?? ""}
              work={work.get(currentItem.id) ?? ""}
              isFlagged={flagged.has(currentItem.id)}
              activeWorkTab={getWorkTab(currentItem.id)}
              onWorkTabChange={(t) => setWorkTab(currentItem.id, t)}
              onResponseChange={(r) =>
                recordResponse(
                  currentItem.id,
                  r,
                  isItemWithWork(currentItem) ? (work.get(currentItem.id) ?? "") : undefined,
                )
              }
              onWorkChange={(w) =>
                recordResponse(currentItem.id, responses.get(currentItem.id) ?? "", w)
              }
              onPrev={handlePrev}
              onSkip={handleSkip}
              onFlag={handleFlag}
              onSaveAndNext={handleSaveAndNext}
              canGoPrev={currentIndex > 0}
              canGoNext={currentIndex < totalItems - 1}
              sketchHandleRef={
                currentItem.kind === "math"
                  ? (handle: SketchCanvasHandle | null) => {
                      sketchHandleRefs.current.set(currentItem.id, handle);
                    }
                  : undefined
              }
            />
          )}

          {/* ── Submitted: review all items with feedback ── */}
          {isSubmitted && (
            <div className={styles.submittedBanner}>
              <div className={styles.submittedScore}>
                Score: {grade?.total !== undefined ? `${Math.round(grade.total * 100)}%` : "—"}
              </div>
              <p className={styles.submittedSub}>
                Homework submitted. Full feedback is shown below.
              </p>
              <div className={styles.reviewList}>
                {items.map((item, idx) => {
                  const itemGrade = grade?.perItem.find((p) => p.itemId === item.id);
                  return (
                    <div key={item.id} className={styles.reviewItem}>
                      <div className={styles.itemMeta}>
                        <span className={styles.itemNum}>item {idx + 1}</span>
                        <span className={styles.typePill}>{item.kind}</span>
                      </div>
                      <AssignmentItemCard
                        item={item}
                        index={idx}
                        response={responses.get(item.id) ?? ""}
                        {...(isItemWithWork(item) && { work: work.get(item.id) ?? "" })}
                        onResponseChange={() => {}}
                        disabled={true}
                      />
                      {itemGrade && (
                        <AssignmentFeedback
                          grade={itemGrade}
                          {...("rubric" in item &&
                            (item as { rubric?: unknown }).rubric !== undefined && {
                              rubric: (item as { rubric: import("@praxis/core/types").Rubric })
                                .rubric,
                            })}
                          {...((item.kind === "math" ||
                            item.kind === "code" ||
                            item.kind === "numerical") &&
                            item.workRubric !== undefined && {
                              workRubric: item.workRubric,
                            })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* ── Right rail: submit card ── */}
        <aside className={styles.rail} aria-label="Submit homework">
          <div className={styles.submitCard}>
            <div className={styles.submitLabel}>⁂ Submit the set</div>
            <div className={styles.statRow}>
              <span>Answered</span>
              <span className={styles.statVal}>
                {answeredCount} / {totalItems}
              </span>
            </div>
            <div className={styles.statRow}>
              <span>Skipped</span>
              <span className={styles.statVal}>{skippedCount}</span>
            </div>
            <div className={styles.statRow}>
              <span>Flagged</span>
              <span className={styles.statVal}>{flaggedCount}</span>
            </div>
            <div className={styles.statRow}>
              <span>Empty</span>
              <span className={styles.statVal}>{emptyCount}</span>
            </div>

            {!isSubmitted && (
              <>
                <button type="button" className={styles.submitSecondaryBtn}>
                  Save &amp; close · finish later
                </button>
                <button
                  type="button"
                  className={styles.submitPrimaryBtn}
                  onClick={handleFinalSubmit}
                  disabled={submitting || emptyCount > 0}
                  aria-disabled={emptyCount > 0}
                >
                  {submitting
                    ? "Grading…"
                    : emptyCount > 0
                      ? `Submit (${emptyCount} empty)`
                      : "Submit set →"}
                </button>
                {submitError && <p className={styles.submitError}>Error: {submitError}</p>}
                <div className={styles.submitHint}>
                  <em>Submission triggers grading + tutor walkthrough</em> of any items you missed.
                  You can re-do as many times as the lesson allows.
                </div>
              </>
            )}

            {isSubmitted && <div className={styles.submittedPill}>✓ Submitted</div>}
          </div>

          <h3 className={styles.railHead}>Concepts in this set</h3>
          {assignment.conceptIds.length > 0 ? (
            <div className={styles.conceptList}>
              {assignment.conceptIds.map((cid) => (
                <div key={cid} className={styles.conceptRow}>
                  ❦ {cid}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.conceptList}>
              <div
                className={styles.conceptRow}
                style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}
              >
                —
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

interface HomeworkHeadProps {
  tab: SessionTabSummary;
  answeredCount: number;
  totalItems: number;
  progressPct: number;
}

function HomeworkHead({
  tab,
  answeredCount,
  totalItems,
  progressPct,
}: HomeworkHeadProps): JSX.Element {
  return (
    <header className={styles.head}>
      <div className={styles.kicker}>
        <span className={styles.kickerDot} aria-hidden="true" />
        <span className={styles.kickerGlyph} aria-hidden="true">
          ❦
        </span>
        <span className={styles.kickerMode}>homework</span>
        {tab.title && <span className={styles.kickerSep}>·</span>}
        {tab.title && <span className={styles.kickerTitle}>{tab.title}</span>}
      </div>
      {totalItems > 0 && (
        <div className={styles.headProgress}>
          <span className={styles.progressLabel}>
            {answeredCount} / {totalItems}
          </span>
          <div className={styles.progressBar} aria-hidden="true">
            <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}
    </header>
  );
}

// ── PageStatusPill ────────────────────────────────────────────────────────────

function PageStatusPill({ status }: { status: ItemSaveStatus }): JSX.Element {
  switch (status) {
    case "answered":
      return <span className={`${styles.pageStatus} ${styles.pageStatusDone}`}>✓</span>;
    case "skipped":
      return <span className={`${styles.pageStatus} ${styles.pageStatusSkip}`}>skip</span>;
    case "flagged":
      return <span className={`${styles.pageStatus} ${styles.pageStatusFlagged}`}>flag</span>;
    default:
      return <span className={`${styles.pageStatus} ${styles.pageStatusEmpty}`}>—</span>;
  }
}

// ── ItemPanel ─────────────────────────────────────────────────────────────────

interface ItemPanelProps {
  item: AssignmentItem;
  index: number;
  totalItems: number;
  response: string;
  work: string;
  isFlagged: boolean;
  activeWorkTab: WorkTab;
  onWorkTabChange: (t: WorkTab) => void;
  onResponseChange: (r: string) => void;
  onWorkChange: (w: string) => void;
  onPrev: () => void;
  onSkip: () => void;
  onFlag: () => void;
  onSaveAndNext: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  sketchHandleRef?: ((handle: SketchCanvasHandle | null) => void) | undefined;
}

function ItemPanel({
  item,
  index,
  totalItems,
  response,
  work,
  isFlagged,
  activeWorkTab,
  onWorkTabChange,
  onResponseChange,
  onWorkChange,
  onPrev,
  onSkip,
  onFlag,
  onSaveAndNext,
  canGoPrev,
  canGoNext,
  sketchHandleRef,
}: ItemPanelProps): JSX.Element {
  const hasWorkRubric = isItemWithWork(item);
  const hasSavedResponse = response !== "";

  return (
    <div className={styles.itemCard}>
      {/* Item meta: number · type-pill · points · concept */}
      <div className={styles.itemMeta}>
        <span className={styles.itemNum}>
          item {index + 1} / {totalItems}
        </span>
        <span className={styles.typePill}>{item.kind}</span>
        {hasWorkRubric && item.workRubric !== undefined && (
          <span className={styles.itemPoints}>partial credit</span>
        )}
      </div>

      {/* Item body — dispatches to AssignmentItemCard for per-kind rendering */}
      <AssignmentItemCard
        item={item}
        index={index}
        response={response}
        {...(hasWorkRubric && { work })}
        onResponseChange={onResponseChange}
        {...(hasWorkRubric && { onWorkChange })}
        disabled={false}
        {...(sketchHandleRef !== undefined && { sketchHandleRef })}
      />

      {/* Work-area tab strip — shown for items without a built-in work area,
          or as an additional scratchpad for all item types */}
      <div className={styles.workArea}>
        <div className={styles.workHead}>
          <span className={styles.workHeadLabel}>Your work</span>
          <div className={styles.workTabs} role="tablist" aria-label="Work area tabs">
            {(["typed", "show-work", "sketch"] as WorkTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={activeWorkTab === t}
                className={`${styles.workTab}${activeWorkTab === t ? ` ${styles.workTabActive}` : ""}`}
                onClick={() => onWorkTabChange(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <span className={styles.workSpacer} />
          {hasSavedResponse && <span className={styles.workSaved}>✓ saved</span>}
        </div>
        {activeWorkTab === "typed" && (
          <textarea
            className={styles.workTextarea}
            value={work}
            onChange={(e) => onWorkChange(e.target.value)}
            placeholder="Type your answer or scratch work here…"
            aria-label="Typed answer"
          />
        )}
        {activeWorkTab === "show-work" && (
          <textarea
            className={`${styles.workTextarea} ${styles.workTextareaMono}`}
            value={work}
            onChange={(e) => onWorkChange(e.target.value)}
            placeholder="Show your work step by step…"
            aria-label="Show work"
          />
        )}
        {activeWorkTab === "sketch" && (
          <section className={styles.sketchPlaceholder} aria-label="Sketch area">
            <span className={styles.sketchHint}>
              sketch area — use the draw tool in the item above
            </span>
          </section>
        )}
      </div>

      {/* Ask-for-clarification row */}
      <div className={styles.askRow}>
        <span className={styles.askGlyph}>§</span>
        <span>
          Stuck on what the item is asking? <em>Praxis will clarify the prompt</em> — not the
          solution.
        </span>
        <button type="button" className={styles.askBtn}>
          Ask about this item
        </button>
      </div>

      {/* Action bar: prev / flag / skip / save-and-next */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onPrev}
          disabled={!canGoPrev}
          aria-label="Previous item"
        >
          ← Previous
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnFlag}${isFlagged ? ` ${styles.actionBtnFlagActive}` : ""}`}
          onClick={onFlag}
          aria-pressed={isFlagged}
        >
          ⚑ {isFlagged ? "Flagged" : "Flag for review"}
        </button>
        <button type="button" className={styles.actionBtn} onClick={onSkip}>
          Skip — fill later
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={onSaveAndNext}
          disabled={!canGoNext}
          aria-label="Save and go to next item"
        >
          Save &amp; next →
        </button>
        <span className={styles.actionHint}>— ⌘→ next · ⌘← prev · ⌘F flag</span>
      </div>
    </div>
  );
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isItemWithWork(item: AssignmentItem): item is AssignmentItem & { workRubric?: unknown } {
  return (
    (item.kind === "math" || item.kind === "code" || item.kind === "numerical") &&
    "workRubric" in item
  );
}
