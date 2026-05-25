import type {
  Note,
  ProposedCourse,
  Rating,
  RenderToggles,
  RetrievalCitation,
} from "@praxis/core/types";
import { useEasedStream } from "../hooks/use-eased-stream.js";
import { DraftCard } from "./draft-card.js";
import type { ReviewCard } from "./flashcard-review.js";
import { FlashcardReview } from "./flashcard-review.js";
import { MarkdownContent } from "./markdown-content.js";
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
  /** Content-type feature toggles forwarded to `MarkdownContent`. */
  renderToggles?: Required<RenderToggles>;
  /** Student ID forwarded to `MarkdownContent` for first-occurrence tracking. */
  studentId?: string;
  /** Session ID forwarded to `MarkdownContent` for first-occurrence recording. */
  sessionId?: string;
  /** Concept-ref click handler forwarded to `MarkdownContent`. */
  conceptOpen?: (slug: string) => void;
  /**
   * When true, the currently-streaming message will record first-occurrence
   * term sightings. Forwarded to `MarkdownContent`.
   */
  recordDefinitionOccurrence?: boolean;
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
  renderToggles,
  studentId,
  sessionId,
  conceptOpen,
  recordDefinitionOccurrence,
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
      {role === "assistant" ? (
        <MarkdownContent
          content={displayContent}
          {...(citations !== undefined && { citationCount: citations.length })}
          onCitationClick={handleCitationClick}
          {...(renderToggles !== undefined && { renderToggles })}
          {...(studentId !== undefined && { studentId })}
          {...(sessionId !== undefined && { sessionId })}
          {...(conceptOpen !== undefined && { conceptOpen })}
          {...(recordDefinitionOccurrence !== undefined && { recordDefinitionOccurrence })}
        />
      ) : (
        <p className={styles.content}>{displayContent}</p>
      )}
      {streaming && <span className={styles.cursor} aria-hidden="true" />}
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
