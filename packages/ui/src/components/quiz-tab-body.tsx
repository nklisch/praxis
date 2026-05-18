/**
 * Quiz tab body — redesign.
 *
 * Layout: two-column grid.
 *   - Center (flex-1): quiz head + mode-rule banner + current item card + next-item ghost
 *   - Right rail (280px): item-status dots + concepts-under-check + item-kinds summary
 *
 * No tutor scaffolding mid-quiz — the sidekick is intentionally absent.
 * Confidence band rendered via AssignmentItemCard (already wired for quiz mode).
 * One item at a time; navigation via Skip / Submit answer. After all items are
 * answered / skipped the student submits the full quiz.
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
import styles from "./quiz-tab-body.module.css";
import type { SketchCanvasHandle } from "./sketch-canvas.js";

export interface QuizTabBodyProps {
  tab: SessionTabSummary;
}

type ItemStatus = "upcoming" | "current" | "answered" | "skipped";

/**
 * Quiz tab body — item-typed cards, item-status rail, no tutor mid-quiz.
 */
export function QuizTabBody({ tab }: QuizTabBodyProps): JSX.Element {
  const assignmentId = tab.assignmentId ? brandId<"AssignmentId">(tab.assignmentId) : undefined;

  const client = usePraxisClient();

  const {
    assignment,
    responses,
    work,
    confidences,
    loading,
    error,
    submitting,
    submitError,
    recordResponse,
    recordConfidence,
    submit,
  } = useAssignment(assignmentId);

  // Current item index within the assignment's items list.
  const [currentIndex, setCurrentIndex] = useState(0);

  // Items that have been explicitly skipped (by itemId).
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // Final submission result (shown after submit).
  const [submitResult, setSubmitResult] = useState<AssignmentSubmissionResult | null>(null);

  // Sketch handle refs — forwarded from math items to capture on final submit.
  const sketchHandleRefs = useRef<Map<string, SketchCanvasHandle | null>>(new Map());

  const items: AssignmentItem[] = assignment?.items ?? [];
  const totalItems = items.length;
  const isSubmitted = !!(assignment?.grade ?? submitResult?.grade);

  // Derive per-item status.
  function itemStatus(idx: number): ItemStatus {
    const item = items[idx];
    if (!item) return "upcoming";
    if (idx === currentIndex && !isSubmitted) return "current";
    if (responses.has(item.id) && responses.get(item.id) !== "") return "answered";
    if (skipped.has(item.id)) return "skipped";
    return "upcoming";
  }

  // Count how many items have a non-empty response (for progress display).
  const answeredCount = items.filter(
    (item) => responses.has(item.id) && responses.get(item.id) !== "",
  ).length;

  async function handleSubmitItem() {
    if (!items[currentIndex]) return;
    // Advance to next unanswered item, or to the end.
    const nextIdx = items.findIndex(
      (item, idx) =>
        idx > currentIndex && !skipped.has(item.id) && (responses.get(item.id) ?? "") === "",
    );
    if (nextIdx !== -1) {
      setCurrentIndex(nextIdx);
    } else {
      // All remaining items answered/skipped; stay on current or go to end
      setCurrentIndex(totalItems);
    }
  }

  function handleSkipItem() {
    const item = items[currentIndex];
    if (!item) return;
    setSkipped((prev) => new Set([...prev, item.id]));
    const nextIdx = items.findIndex(
      (itm, idx) =>
        idx > currentIndex && !skipped.has(itm.id) && (responses.get(itm.id) ?? "") === "",
    );
    if (nextIdx !== -1) {
      setCurrentIndex(nextIdx);
    } else {
      setCurrentIndex(totalItems);
    }
  }

  async function handleFinalSubmit() {
    // Capture sketches from math items before submitting.
    if (assignment) {
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
          const existingWork = work.get(item.id) ?? "";
          if (!assignmentId) continue;
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
    }

    const result = await submit();
    if (result) {
      setSubmitResult(result);
      setCurrentIndex(0); // reset to first for review mode
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const currentItem = items[currentIndex];
  const nextItem = items[currentIndex + 1];

  const grade = submitResult?.grade ?? assignment?.grade ?? null;

  // Item kinds summary for the rail.
  const kindCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] ?? 0) + 1;
    return acc;
  }, {});

  if (!tab.assignmentId) {
    return (
      <div className={styles.container}>
        <QuizHead tab={tab} progress={null} />
        <div className={styles.noAssignment}>
          <p>no assignment is linked to this session.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <QuizHead tab={tab} progress={null} />
        <div className={styles.noAssignment}>
          <p className={styles.loadingText}>Loading quiz…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <QuizHead tab={tab} progress={null} />
        <div className={styles.noAssignment}>
          <p className={styles.errorText}>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className={styles.container}>
        <QuizHead tab={tab} progress={null} />
        <div className={styles.noAssignment}>
          <p>no assignment found.</p>
        </div>
      </div>
    );
  }

  const progressLabel = isSubmitted
    ? `${totalItems} items · submitted`
    : `item ${Math.min(currentIndex + 1, totalItems)} of ${totalItems}`;

  return (
    <div className={styles.container}>
      <QuizHead
        tab={tab}
        progress={progressLabel}
        answeredCount={answeredCount}
        totalItems={totalItems}
      />

      <div className={styles.surface}>
        {/* ── Center: active item + optional next ghost ── */}
        <main className={styles.main}>
          {/* Mode rule banner — shown while quiz is in progress */}
          {!isSubmitted && (
            <div className={styles.modeRule}>
              <em>This is quiz mode.</em> No tutor scaffolding during the quiz — the tutor returns
              after you submit and walks the misses with you. Confidence on each item helps the
              system tell <em>&ldquo;I knew it&rdquo;</em> from <em>&ldquo;I guessed.&rdquo;</em>
            </div>
          )}

          {/* ── In-progress: current item card ── */}
          {!isSubmitted && currentItem && currentIndex < totalItems && (
            <>
              <div className={styles.itemCard}>
                <div className={styles.itemMeta}>
                  <span className={styles.itemNum}>
                    item {currentIndex + 1} / {totalItems}
                  </span>
                  <span className={styles.typePill}>{currentItem.kind}</span>
                  {"concept" in currentItem && (currentItem as { concept?: string }).concept && (
                    <span className={styles.itemConcept}>
                      concept: {(currentItem as { concept: string }).concept}
                    </span>
                  )}
                </div>

                <AssignmentItemCard
                  item={currentItem}
                  index={currentIndex}
                  response={responses.get(currentItem.id) ?? ""}
                  {...(isItemWithWork(currentItem) && {
                    work: work.get(currentItem.id) ?? "",
                  })}
                  onResponseChange={(r) =>
                    recordResponse(
                      currentItem.id,
                      r,
                      isItemWithWork(currentItem) ? (work.get(currentItem.id) ?? "") : undefined,
                    )
                  }
                  {...(isItemWithWork(currentItem) && {
                    onWorkChange: (w: string) =>
                      recordResponse(currentItem.id, responses.get(currentItem.id) ?? "", w),
                  })}
                  disabled={false}
                  {...(currentItem.kind === "math" && {
                    sketchHandleRef: (handle: SketchCanvasHandle | null) => {
                      sketchHandleRefs.current.set(currentItem.id, handle);
                    },
                  })}
                  confidence={confidences.get(currentItem.id) ?? null}
                  onConfidenceChange={(c) => recordConfidence(currentItem.id, c)}
                />

                <div className={styles.actions}>
                  <button type="button" className={styles.actionBtn} onClick={handleSkipItem}>
                    Skip for now
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                    onClick={handleSubmitItem}
                    disabled={(responses.get(currentItem.id) ?? "") === ""}
                  >
                    Submit answer ↵
                  </button>
                  <span className={styles.actionHint}>
                    ⌘↵ submit · ⌘. skip · feedback after the full quiz lands
                  </span>
                </div>
              </div>

              {/* Next item ghost */}
              {nextItem && (
                <div className={`${styles.itemCard} ${styles.itemCardGhost}`}>
                  <div className={styles.itemMeta}>
                    <span className={styles.itemNum}>
                      item {currentIndex + 2} / {totalItems} · next
                    </span>
                    <span className={styles.typePill}>{nextItem.kind}</span>
                  </div>
                  {"prompt" in nextItem && (
                    <div className={styles.ghostPrompt}>
                      {String((nextItem as { prompt: string }).prompt).slice(0, 80)}
                      {String((nextItem as { prompt: string }).prompt).length > 80 ? "…" : ""}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── All items answered/skipped: ready for final submit ── */}
          {!isSubmitted && currentIndex >= totalItems && (
            <div className={styles.itemCard}>
              <div className={styles.readyHead}>
                <div className={styles.readyTitle}>Ready to submit</div>
                <p className={styles.readySub}>
                  You&apos;ve worked through all {totalItems} items.
                  {skipped.size > 0 && ` (${skipped.size} skipped — still counted.)`} Submit now and
                  the tutor will walk you through the misses.
                </p>
              </div>

              <div className={styles.actions}>
                {skipped.size > 0 && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => {
                      const firstSkipped = items.findIndex((item) => skipped.has(item.id));
                      if (firstSkipped !== -1) {
                        setSkipped((prev) => {
                          const next = new Set(prev);
                          const skippedItem = items[firstSkipped];
                          if (skippedItem) next.delete(skippedItem.id);
                          return next;
                        });
                        setCurrentIndex(firstSkipped);
                      }
                    }}
                  >
                    Return to skipped
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                >
                  {submitting ? "Grading…" : `Submit quiz (${totalItems} items) ↵`}
                </button>
              </div>

              {submitError && <p className={styles.submitError}>Error: {submitError}</p>}
            </div>
          )}

          {/* ── Submitted / review mode ── */}
          {isSubmitted && (
            <div className={styles.submittedBanner}>
              <div className={styles.submittedScore}>
                Score: {grade?.total !== undefined ? `${Math.round(grade.total * 100)}%` : "—"}
              </div>
              <p className={styles.submittedSub}>
                Quiz submitted. The tutor will walk you through the misses in the teach session.
              </p>

              {/* Review all items with feedback */}
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
                        {...(isItemWithWork(item) && {
                          work: work.get(item.id) ?? "",
                        })}
                        onResponseChange={() => {}}
                        disabled={true}
                        confidence={confidences.get(item.id) ?? null}
                      />
                      {itemGrade && (
                        <AssignmentFeedback
                          grade={itemGrade}
                          {...("rubric" in item &&
                            item.rubric !== undefined && {
                              rubric: item.rubric,
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

        {/* ── Right rail: item-status dots + meta ── */}
        <aside className={styles.rail} aria-label="Quiz item status">
          <h3 className={styles.railHead}>Items</h3>
          <ul className={styles.dotGrid}>
            {items.map((item, idx) => {
              const status = itemStatus(idx);
              const dotClass = [
                styles.dot,
                status === "current" && styles.dotCurrent,
                status === "answered" && styles.dotAnswered,
                status === "skipped" && styles.dotSkipped,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={item.id} className={styles.dotItem}>
                  <button
                    type="button"
                    className={dotClass}
                    aria-label={`Item ${idx + 1}: ${status}`}
                    aria-current={status === "current" ? "true" : undefined}
                    onClick={() => {
                      if (!isSubmitted) setCurrentIndex(idx);
                    }}
                    title={`Item ${idx + 1} (${status})`}
                  >
                    {idx + 1}
                  </button>
                </li>
              );
            })}
          </ul>

          {totalItems > 0 && (
            <div className={styles.railSummaryText}>
              {answeredCount} answered · {skipped.size > 0 && `${skipped.size} skipped · `}
              {totalItems - answeredCount - skipped.size} ahead
            </div>
          )}

          {/* Item kinds summary */}
          {Object.keys(kindCounts).length > 0 && (
            <>
              <h3 className={`${styles.railHead} ${styles.railHeadSpaced}`}>Item kinds</h3>
              <div className={styles.kindList}>
                {Object.entries(kindCounts).map(([kind, count]) => (
                  <div key={kind} className={styles.kindRow}>
                    ‡ {count} {kind}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={styles.railTiming}>
            <em>Quiz mode</em> · no time limit · pause and resume anytime · tutor is held for
            after-quiz narration.
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Helper: QuizHead subcomponent ────────────────────────────────────────────

interface QuizHeadProps {
  tab: SessionTabSummary;
  progress: string | null;
  answeredCount?: number;
  totalItems?: number;
}

function QuizHead({
  tab,
  progress,
  answeredCount = 0,
  totalItems = 0,
}: QuizHeadProps): JSX.Element {
  const fillPct = totalItems > 0 ? (answeredCount / totalItems) * 100 : 0;

  return (
    <header className={styles.head}>
      <div className={styles.kicker}>
        <span className={styles.kickerDot} aria-hidden="true" />
        <span className={styles.kickerGlyph} aria-hidden="true">
          ‡
        </span>
        <span className={styles.kickerMode}>quiz</span>
        {tab.title && <span className={styles.kickerSep}>·</span>}
        {tab.title && <span className={styles.kickerTitle}>{tab.title}</span>}
      </div>
      {progress && (
        <div className={styles.headProgress}>
          <span className={styles.progressLabel}>{progress}</span>
          {totalItems > 0 && (
            <div className={styles.progressBar} aria-hidden="true">
              <div className={styles.progressFill} style={{ width: `${fillPct}%` }} />
            </div>
          )}
        </div>
      )}
    </header>
  );
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isItemWithWork(item: AssignmentItem): item is AssignmentItem & { workRubric?: unknown } {
  return (
    (item.kind === "math" || item.kind === "code" || item.kind === "numerical") &&
    "workRubric" in item
  );
}
