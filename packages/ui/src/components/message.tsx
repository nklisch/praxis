import type { Note, ProposedCourse, Rating, RetrievalCitation } from "@praxis/core/types";
import { useEasedStream } from "../hooks/use-eased-stream.js";
import { CitationChip } from "./citation-chip.js";
import { DraftCard } from "./draft-card.js";
import type { ReviewCard } from "./flashcard-review.js";
import { FlashcardReview } from "./flashcard-review.js";
import styles from "./message.module.css";
import { NoteCard } from "./note-card.js";
import { SourceCard } from "./source-card.js";

export type MessageRole = "user" | "assistant";

export interface MessageBubbleProps {
  role: MessageRole;
  content: string;
  /**
   * Raw content as it arrives off the wire. When `streaming` is true, the
   * bubble passes this to `useEasedStream` for paced release. When streaming
   * is false (settled), the bubble renders `content` directly. Defaults to
   * `content` when omitted (backwards-compatible for non-streaming callers).
   */
  rawContent?: string;
  streaming?: boolean | undefined;
  citations?: RetrievalCitation[];
  /** Draft courses from course.show_draft tool results in this message. */
  drafts?: ProposedCourse[];
  /** Notes from note.show tool results in this message. */
  notes?: Note[];
  /** Due cards from flashcard.review_next tool results in this message. */
  dueCards?: ReviewCard[];
  onViewPage?: (documentId: string, page: number) => void;
  /** Handler for rating a due card from the inline review surface. */
  onRateCard?: (flashcardId: string, rating: Rating) => Promise<void>;
}

/**
 * Render content with inline [N] citation chips parsed from the text.
 * Regex matches [1], [2], etc. Only renders chips when citations array is present.
 */
function renderContentWithCitations(
  content: string,
  citations: RetrievalCitation[] | undefined,
  onCitationClick: (index: number) => void,
): React.ReactNode {
  if (!citations || citations.length === 0) {
    return <p className={styles.content}>{content}</p>;
  }

  const CHIP_REGEX = /\[(\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let last = 0;

  for (let match = CHIP_REGEX.exec(content); match !== null; match = CHIP_REGEX.exec(content)) {
    const idx = Number(match[1]);
    if (match.index > last) {
      parts.push(content.slice(last, match.index));
    }
    parts.push(<CitationChip key={`chip-${match.index}`} index={idx} onClick={onCitationClick} />);
    last = match.index + match[0].length;
  }
  if (last < content.length) {
    parts.push(content.slice(last));
  }

  return <p className={styles.content}>{parts}</p>;
}

export function MessageBubble({
  role,
  content,
  rawContent,
  streaming = false,
  citations,
  drafts,
  notes,
  dueCards,
  onViewPage,
  onRateCard,
}: MessageBubbleProps) {
  // Use rawContent (falling back to content) as the source for eased release
  // while the message is streaming. The hook returns raw immediately when
  // disabled=true so settled messages incur no extra renders.
  const easedContent = useEasedStream(rawContent ?? content, { disabled: !streaming });

  // Show the eased version while streaming; once done, show the full content.
  const displayContent = streaming ? easedContent : content;

  const handleCitationClick = (index: number) => {
    // Scroll to the source card with matching id
    const el = document.getElementById(`citation-${index}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className={`${styles.bubble} ${styles[role] ?? ""} ${streaming ? styles.streaming : ""}`}>
      <span className={styles.label}>{role === "user" ? "You" : "Tutor"}</span>
      {renderContentWithCitations(displayContent, citations, handleCitationClick)}
      {drafts && drafts.length > 0 && role === "assistant" && (
        <div className={styles.drafts}>
          {drafts.map((draft, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: drafts in a single message are indexed by position
            <DraftCard key={i} proposed={draft} />
          ))}
        </div>
      )}
      {notes && notes.length > 0 && role === "assistant" && (
        <div className={styles.notes}>
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
      {dueCards && dueCards.length > 0 && role === "assistant" && (
        <div className={styles.dueCards}>
          {dueCards.map((card) => (
            <FlashcardReview
              key={card.flashcardId}
              card={card}
              onRate={async (rating) => {
                if (onRateCard) await onRateCard(card.flashcardId, rating);
              }}
            />
          ))}
        </div>
      )}
      {citations && citations.length > 0 && role === "assistant" && (
        <div className={styles.sources}>
          {citations.map((c) => (
            <SourceCard
              key={c.chunkId}
              citation={c}
              {...(onViewPage !== undefined && { onViewPage })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
