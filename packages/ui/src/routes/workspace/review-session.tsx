import type { Rating } from "@praxis/core/types";
import { useState } from "react";
import { WorkspaceFlashcardReview } from "../../components/flashcard-review.js";
import { useDueCards } from "../../hooks/use-due-cards.js";
import styles from "./review-session.module.css";

/**
 * Review tab — sit-down flashcard review session.
 *
 * Shows one due card at a time via WorkspaceFlashcardReview.
 * After rating, removes the card from the queue (optimistic) and advances.
 * When the queue empties, shows an "All done" celebration screen.
 * Pre-fetches no data — back text is already on the Flashcard object.
 */
export function ReviewSessionTab() {
  const { dueList, loading, error, refresh, reviewCard } = useDueCards();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [done, setDone] = useState(false);

  const remaining = dueList.length;

  const handleRate = async (rating: Rating) => {
    const card = dueList[currentIndex];
    if (!card) return;

    await reviewCard(card.id, rating);
    setReviewedCount((c) => c + 1);

    // Advance to next card or finish
    if (currentIndex >= remaining - 1) {
      setDone(true);
    } else {
      // Stay at the same index — the rated card is removed from dueList by the hook
      // so the next card slides into this position.
    }
  };

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
        <p className={styles.error}>{error}</p>
        <button type="button" className={styles.refreshBtn} onClick={refresh}>
          Retry
        </button>
      </div>
    );
  }

  if (done || (remaining === 0 && reviewedCount > 0)) {
    return (
      <div className={styles.layout}>
        <div className={styles.doneScreen}>
          <span className={styles.doneIcon} aria-hidden>
            ✓
          </span>
          <h2 className={styles.doneTitle}>All done!</h2>
          <p className={styles.doneSubtitle}>
            You reviewed {reviewedCount} card{reviewedCount !== 1 ? "s" : ""}. Come back tomorrow
            for more.
          </p>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={async () => {
              setReviewedCount(0);
              setCurrentIndex(0);
              setDone(false);
              await refresh();
            }}
          >
            Check again
          </button>
        </div>
      </div>
    );
  }

  if (remaining === 0) {
    return (
      <div className={styles.layout}>
        <div className={styles.emptyScreen}>
          <span className={styles.emptyIcon} aria-hidden>
            🌙
          </span>
          <h2 className={styles.emptyTitle}>Nothing due right now.</h2>
          <p className={styles.emptySubtitle}>Come back later — your cards are scheduled.</p>
          <button type="button" className={styles.refreshBtn} onClick={refresh}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const currentCard = dueList[currentIndex];
  if (!currentCard) return null;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.progress}>
          <span className={styles.progressText}>
            {reviewedCount} / {reviewedCount + remaining} reviewed
          </span>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${(reviewedCount / (reviewedCount + remaining)) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <div className={styles.cardArea}>
        <WorkspaceFlashcardReview card={currentCard} onRate={handleRate} />
      </div>
    </div>
  );
}
