import type { Flashcard, Rating } from "@praxis/core/types";
import { useState } from "react";
import { useDueCards } from "../../hooks/use-due-cards.js";
import styles from "./review-session.module.css";

/**
 * Review tab — spaced-repetition review session.
 *
 * Three phases in sequence:
 *   1. Queue surface — shows due count + "Start session" CTA.
 *   2. Per-card surface — one card at a time with reveal + outcome buttons.
 *   3. Session-end summary — count + got/partial/forgot breakdown.
 *
 * No RouteHeader: this is a tab panel inside <WorkspaceRoute>, not a standalone route.
 */
export function ReviewSessionTab() {
  const { dueList, loading, error, refresh, reviewCard } = useDueCards();

  // Session state machine: "queue" | "reviewing" | "done"
  const [phase, setPhase] = useState<"queue" | "reviewing" | "done">("queue");
  const [sessionQueue, setSessionQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Summary counters
  const [gotCount, setGotCount] = useState(0);
  const [partialCount, setPartialCount] = useState(0);
  const [forgotCount, setForgotCount] = useState(0);

  // Card transition state
  const [cardVisible, setCardVisible] = useState(true);

  const handleStart = () => {
    if (dueList.length === 0) return;
    setSessionQueue([...dueList]);
    setCurrentIndex(0);
    setGotCount(0);
    setPartialCount(0);
    setForgotCount(0);
    setCardVisible(true);
    setPhase("reviewing");
  };

  const handleOutcome = (rating: Rating) => {
    const card = sessionQueue[currentIndex];
    if (!card) return;

    // Fire-and-forget — persist the review result; UI doesn't block on it.
    reviewCard(card.id, rating).catch(() => {
      // Non-fatal: UI advances regardless. The API best-effort records the review.
    });

    // Tally
    if (rating === "good" || rating === "easy") setGotCount((n) => n + 1);
    else if (rating === "hard") setPartialCount((n) => n + 1);
    else setForgotCount((n) => n + 1);

    const nextIndex = currentIndex + 1;

    if (nextIndex >= sessionQueue.length) {
      // Fade out, then show done
      setCardVisible(false);
      setTimeout(() => setPhase("done"), 250);
    } else {
      // Fade out → swap card → fade in
      setCardVisible(false);
      setTimeout(() => {
        setCurrentIndex(nextIndex);
        setCardVisible(true);
      }, 220);
    }
  };

  // ── Loading / error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>Loading due cards…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.layout}>
        <p className={styles.errorMsg}>{error}</p>
        <button type="button" className={styles.ctaBtn} onClick={refresh}>
          Retry
        </button>
      </div>
    );
  }

  // ── Phase: queue ──────────────────────────────────────────────────────────

  if (phase === "queue") {
    if (dueList.length === 0) {
      return (
        <div className={styles.layout}>
          <div className={styles.centerStage}>
            <span className={styles.glyphBlock} aria-hidden>
              ·
            </span>
            <h2 className={styles.stageTitle}>All caught up.</h2>
            <p className={styles.stageSub}>
              No cards are due right now. Your next batch is scheduled.
            </p>
            <button type="button" className={styles.ghostBtn} onClick={refresh}>
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.layout}>
        <div className={styles.centerStage}>
          <div className={styles.queueCount}>
            <span className={styles.queueNumber}>{dueList.length}</span>
            <span className={styles.queueLabel}>
              {dueList.length === 1 ? "card due" : "cards due"}
            </span>
          </div>
          <h2 className={styles.stageTitle}>Ready to review?</h2>
          <p className={styles.stageSub}>
            Work through each card at your own pace. Rate your recall honestly — the schedule
            adapts.
          </p>
          <button type="button" className={styles.ctaBtn} onClick={handleStart}>
            Start session →
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: done ────────────────────────────────────────────────────────────

  if (phase === "done") {
    const total = gotCount + partialCount + forgotCount;
    return (
      <div className={styles.layout}>
        <div className={styles.centerStage}>
          <span className={styles.glyphBlock} aria-hidden>
            ✓
          </span>
          <h2 className={styles.stageTitle}>Session complete.</h2>
          <p className={styles.stageSub}>
            You reviewed {total} card{total !== 1 ? "s" : ""}.
          </p>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={`${styles.summaryCount} ${styles.gotColor}`}>{gotCount}</span>
              <span className={styles.summaryLabel}>Got it</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={`${styles.summaryCount} ${styles.partialColor}`}>
                {partialCount}
              </span>
              <span className={styles.summaryLabel}>Partial</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={`${styles.summaryCount} ${styles.forgotColor}`}>{forgotCount}</span>
              <span className={styles.summaryLabel}>Forgot</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={async () => {
              setPhase("queue");
              setSessionQueue([]);
              setCurrentIndex(0);
              await refresh();
            }}
          >
            Check for more
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: reviewing ──────────────────────────────────────────────────────

  const card = sessionQueue[currentIndex];
  if (!card) return null;

  const total = sessionQueue.length;
  const reviewed = currentIndex; // cards before current index
  const progressPct = total > 0 ? (reviewed / total) * 100 : 0;

  return (
    <div className={styles.layout}>
      {/* Progress header */}
      <header className={styles.progressHeader}>
        <div className={styles.progressMeta}>
          <span className={styles.progressText} aria-live="polite">
            {reviewed} / {total}
          </span>
          <button
            type="button"
            className={styles.exitLink}
            onClick={() => setPhase("queue")}
            aria-label="Exit session"
          >
            ✕
          </button>
        </div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuenow={reviewed}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      </header>

      {/* Card area — key on card.id resets CardSurface state when the card changes */}
      <div className={styles.cardStage}>
        <div
          className={`${styles.cardWrap} ${cardVisible ? styles.cardVisible : styles.cardHidden}`}
        >
          <CardSurface key={card.id} card={card} onOutcome={handleOutcome} />
        </div>
      </div>
    </div>
  );
}

// ── Per-card surface ──────────────────────────────────────────────────────────

interface CardSurfaceProps {
  card: Flashcard;
  onOutcome: (rating: Rating) => void;
}

function CardSurface({ card, onOutcome }: CardSurfaceProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <article className={styles.card} aria-label="Flashcard">
      {/* Front */}
      <div className={styles.cardFront}>
        <span className={styles.cardKicker}>Question</span>
        <p className={styles.cardFrontText}>{card.front}</p>
      </div>

      {/* Answer band — collapses until revealed */}
      {!revealed ? (
        <div className={styles.revealBand}>
          <button type="button" className={styles.revealBtn} onClick={() => setRevealed(true)}>
            Reveal answer
          </button>
        </div>
      ) : (
        <>
          <div className={styles.cardBack}>
            <span className={styles.cardKicker}>Answer</span>
            <p className={styles.cardBackText}>{card.back}</p>
          </div>

          {/* Outcome buttons */}
          <div className={styles.outcomeBand}>
            <p className={styles.outcomePrompt}>How did you do?</p>
            <div className={styles.outcomeRow}>
              <button
                type="button"
                className={`${styles.outcomeBtn} ${styles.outcomeForgot}`}
                onClick={() => onOutcome("again")}
              >
                Forgot
              </button>
              <button
                type="button"
                className={`${styles.outcomeBtn} ${styles.outcomePartial}`}
                onClick={() => onOutcome("hard")}
              >
                Partial
              </button>
              <button
                type="button"
                className={`${styles.outcomeBtn} ${styles.outcomeGot}`}
                onClick={() => onOutcome("good")}
              >
                Got it
              </button>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
