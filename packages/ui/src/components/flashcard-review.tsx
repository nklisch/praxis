import type { Flashcard, Rating, Timestamp } from "@praxis/core/types";
import { useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./flashcard-review.module.css";

/** Preview of next interval per rating. */
export interface RatingPreview {
  again: { nextReviewAt: Timestamp };
  hard: { nextReviewAt: Timestamp };
  good: { nextReviewAt: Timestamp };
  easy: { nextReviewAt: Timestamp };
}

export interface ReviewCard {
  flashcardId: string;
  front: string;
  conceptId?: string;
  /** FSRS preview intervals — shown on rating buttons. */
  preview?: RatingPreview;
}

export interface FlashcardReviewProps {
  card: ReviewCard;
  onRate: (rating: Rating) => Promise<void>;
}

const RATINGS: Array<{ rating: Rating; label: string; className: string | undefined }> = [
  { rating: "again", label: "Again", className: styles.ratingAgain },
  { rating: "hard", label: "Hard", className: styles.ratingHard },
  { rating: "good", label: "Good", className: styles.ratingGood },
  { rating: "easy", label: "Easy", className: styles.ratingEasy },
];

/**
 * Inline flashcard review component — front shown initially.
 * "Show answer" button fetches the back text via client.flashcards.get (eager fetch).
 * Four rating buttons appear with FSRS preview intervals.
 * onRate is called by the parent; it decides what comes next.
 */
export function FlashcardReview({ card, onRate }: FlashcardReviewProps) {
  const client = usePraxisClient();
  const [showingBack, setShowingBack] = useState(false);
  const [back, setBack] = useState<string | null>(null);
  const [fetchingBack, setFetchingBack] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);

  const handleShowAnswer = async () => {
    if (back !== null) {
      setShowingBack(true);
      return;
    }
    setFetchingBack(true);
    setFetchError(null);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: FlashcardId branded — cast safely
      const fullCard = await client.flashcards.get(card.flashcardId as any);
      if (fullCard) {
        setBack(fullCard.back);
      } else {
        setFetchError("Card not found.");
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingBack(false);
      setShowingBack(true);
    }
  };

  const handleRate = async (r: Rating) => {
    setRating(r);
    await onRate(r);
  };

  return (
    <article className={styles.card} aria-label="Flashcard review">
      <div className={styles.front}>
        <span className={styles.sideLabel}>Question</span>
        <p className={styles.frontText}>{card.front}</p>
      </div>

      {!showingBack && (
        <div className={styles.showAnswerArea}>
          <button
            type="button"
            className={styles.showAnswerBtn}
            onClick={handleShowAnswer}
            disabled={fetchingBack}
          >
            {fetchingBack ? "Loading…" : "Show answer"}
          </button>
          {fetchError && <p className={styles.fetchError}>{fetchError}</p>}
        </div>
      )}

      {showingBack && (
        <>
          <div className={styles.back}>
            <span className={styles.sideLabel}>Answer</span>
            <p className={styles.backText}>{back ?? "—"}</p>
          </div>

          <fieldset className={styles.ratings}>
            <legend className={styles.ratingsLegend}>Rate this card</legend>
            {RATINGS.map(({ rating: r, label, className }) => (
              <button
                key={r}
                type="button"
                className={`${styles.ratingBtn} ${className} ${rating === r ? styles.selected : ""}`}
                onClick={() => handleRate(r)}
                disabled={rating !== null}
                aria-pressed={rating === r}
              >
                <span className={styles.ratingLabel}>{label}</span>
                {card.preview && (
                  <span className={styles.interval}>
                    {formatInterval(card.preview[r].nextReviewAt)}
                  </span>
                )}
              </button>
            ))}
          </fieldset>
        </>
      )}
    </article>
  );
}

// ── Standalone version used in workspace review session ───────────────────────

/**
 * Workspace review variant — takes a full Flashcard (already has back) and
 * an optional preview. Used by review-session.tsx where back is already loaded.
 */
export interface WorkspaceFlashcardReviewProps {
  card: Flashcard;
  preview?: RatingPreview;
  onRate: (rating: Rating) => Promise<void>;
}

export function WorkspaceFlashcardReview({ card, preview, onRate }: WorkspaceFlashcardReviewProps) {
  const [showingBack, setShowingBack] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);

  const handleRate = async (r: Rating) => {
    setRating(r);
    await onRate(r);
  };

  return (
    <article className={styles.card} aria-label="Flashcard review">
      <div className={styles.front}>
        <span className={styles.sideLabel}>Question</span>
        <p className={styles.frontText}>{card.front}</p>
      </div>

      {!showingBack && (
        <div className={styles.showAnswerArea}>
          <button
            type="button"
            className={styles.showAnswerBtn}
            onClick={() => setShowingBack(true)}
          >
            Show answer
          </button>
        </div>
      )}

      {showingBack && (
        <>
          <div className={styles.back}>
            <span className={styles.sideLabel}>Answer</span>
            <p className={styles.backText}>{card.back}</p>
          </div>

          <fieldset className={styles.ratings}>
            <legend className={styles.ratingsLegend}>Rate this card</legend>
            {RATINGS.map(({ rating: r, label, className }) => (
              <button
                key={r}
                type="button"
                className={`${styles.ratingBtn} ${className} ${rating === r ? styles.selected : ""}`}
                onClick={() => handleRate(r)}
                disabled={rating !== null}
                aria-pressed={rating === r}
              >
                <span className={styles.ratingLabel}>{label}</span>
                {preview && (
                  <span className={styles.interval}>{formatInterval(preview[r].nextReviewAt)}</span>
                )}
              </button>
            ))}
          </fieldset>
        </>
      )}
    </article>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatInterval(nextReviewAt: Timestamp): string {
  const diffMs = nextReviewAt - Date.now();
  const diffMins = Math.round(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.round(diffMs / 3_600_000);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.round(diffMs / 86_400_000);
  return `${diffDays}d`;
}
