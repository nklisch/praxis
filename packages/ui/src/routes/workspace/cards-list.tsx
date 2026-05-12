import type { Flashcard } from "@praxis/core/types";
import { useState } from "react";
import { usePraxisClient } from "../../context/client-context.js";
import { useFlashcards } from "../../hooks/use-flashcards.js";
import styles from "./cards-list.module.css";

/**
 * Cards tab — browse all flashcards with stats: due now, learning, mature.
 * Filterable by concept (v1: text input, not a full picker).
 *
 * No RouteHeader: this is a tab panel inside <WorkspaceRoute>, not a standalone route.
 * The parent route owns the header (workspace.tsx renders <RouteHeader>).
 */
export function CardsListTab() {
  const client = usePraxisClient();
  const [showDueOnly, setShowDueOnly] = useState(false);

  const { flashcards, loading, error, refresh } = useFlashcards(showDueOnly ? { due: true } : {});

  // Compute rough stats from loaded cards.
  const dueNow = flashcards.filter((c) => {
    const nr = (c.reviewState as { nextReviewAt?: number }).nextReviewAt;
    return nr !== undefined && nr <= Date.now();
  }).length;

  const neverReviewed = flashcards.filter((c) => {
    return (c.reviewState as { lastReviewedAt?: number }).lastReviewedAt === undefined;
  }).length;

  const reviewed = flashcards.length - neverReviewed;

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <div className={styles.stats}>
          <span className={styles.stat}>
            <span className={styles.statNum}>{flashcards.length}</span> total
          </span>
          <span className={styles.statSep}>·</span>
          <span className={`${styles.stat} ${dueNow > 0 ? styles.due : ""}`}>
            <span className={styles.statNum}>{dueNow}</span> due
          </span>
          <span className={styles.statSep}>·</span>
          <span className={styles.stat}>
            <span className={styles.statNum}>{reviewed}</span> reviewed
          </span>
        </div>

        <button
          type="button"
          className={`${styles.filterBtn} ${showDueOnly ? styles.active : ""}`}
          onClick={() => setShowDueOnly((v) => !v)}
        >
          {showDueOnly ? "Showing due" : "Show all"}
        </button>
      </div>

      {loading && <p className={styles.status}>Loading cards…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && flashcards.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyPrimary}>
            {showDueOnly ? "Nothing due right now." : "No flashcards yet."}
          </p>
          <p className={styles.emptyHint}>
            {showDueOnly
              ? "Come back later or start a review from the Review tab."
              : "Ask the agent to generate cards from a note, or create one directly via flashcard.create."}
          </p>
        </div>
      )}

      {flashcards.length > 0 && (
        <ul className={styles.list}>
          {flashcards.map((card) => (
            <FlashcardListItem
              key={card.id}
              card={card}
              onDelete={async () => {
                await client.flashcards.delete(card.id);
                await refresh();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── FlashcardListItem ─────────────────────────────────────────────────────────

interface FlashcardListItemProps {
  card: Flashcard;
  onDelete: () => Promise<void>;
}

function FlashcardListItem({ card, onDelete }: FlashcardListItemProps) {
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const reviewState = card.reviewState as {
    nextReviewAt?: number;
    lastReviewedAt?: number;
    reps?: number;
  };
  const isDue = reviewState.nextReviewAt !== undefined && reviewState.nextReviewAt <= Date.now();
  const nextReview = reviewState.nextReviewAt
    ? new Date(reviewState.nextReviewAt).toLocaleDateString()
    : "now";

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this flashcard?")) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <li className={`${styles.cardItem} ${isDue ? styles.isDue : ""}`}>
      <button
        type="button"
        className={styles.cardBtn}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className={styles.cardHeader}>
          <span className={styles.cardFront}>{card.front}</span>
          <div className={styles.cardMeta}>
            {isDue && <span className={styles.dueBadge}>Due</span>}
            <span className={styles.nextReview}>Next: {nextReview}</span>
            {reviewState.reps !== undefined && (
              <span className={styles.reps}>
                {reviewState.reps} review{reviewState.reps !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        {expanded && (
          <div className={styles.cardBack}>
            <span className={styles.backLabel}>Answer</span>
            <p className={styles.backText}>{card.back}</p>
          </div>
        )}
      </button>
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Delete flashcard"
        title="Delete"
      >
        ×
      </button>
    </li>
  );
}
