import styles from "./flashcard-proposal.module.css";

export interface ProposedCard {
  front: string;
  back: string;
}

export interface FlashcardProposalProps {
  proposed: ProposedCard[];
  onConfirm: (index: number) => Promise<void>;
  onSkip: (index: number) => void;
}

/**
 * List of proposed flashcards from `flashcard.from_note`.
 * Per-card "Add" / "Skip" buttons — student confirms before persisting.
 * Once confirmed or skipped, the card is visually marked.
 */
export function FlashcardProposal({ proposed, onConfirm, onSkip }: FlashcardProposalProps) {
  if (proposed.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>No flashcards could be extracted from this note.</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <p className={styles.intro}>
        {proposed.length} flashcard{proposed.length !== 1 ? "s" : ""} proposed — confirm each to add
        to your deck:
      </p>
      {proposed.map((card, i) => (
        <ProposedCardItem
          key={card.front}
          card={card}
          onConfirm={() => onConfirm(i)}
          onSkip={() => onSkip(i)}
        />
      ))}
    </div>
  );
}

// ── ProposedCardItem ──────────────────────────────────────────────────────────

interface ProposedCardItemProps {
  card: ProposedCard;
  onConfirm: () => Promise<void>;
  onSkip: () => void;
}

function ProposedCardItem({ card, onConfirm, onSkip }: ProposedCardItemProps) {
  return (
    <article className={styles.card}>
      <div className={styles.cardContent}>
        <div className={styles.side}>
          <span className={styles.sideLabel}>Front</span>
          <p className={styles.sideText}>{card.front}</p>
        </div>
        <div className={styles.divider} />
        <div className={styles.side}>
          <span className={styles.sideLabel}>Back</span>
          <p className={styles.sideText}>{card.back}</p>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.addBtn} onClick={onConfirm}>
          Add
        </button>
        <button type="button" className={styles.skipBtn} onClick={onSkip}>
          Skip
        </button>
      </div>
    </article>
  );
}
