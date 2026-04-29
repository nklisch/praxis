import type { RetrievalCitation } from "@praxis/core/types";
import { CitationChip } from "./citation-chip.js";
import styles from "./message.module.css";
import { SourceCard } from "./source-card.js";

export type MessageRole = "user" | "assistant";

export interface MessageBubbleProps {
  role: MessageRole;
  content: string;
  streaming?: boolean | undefined;
  citations?: RetrievalCitation[];
  onViewPage?: (documentId: string, page: number) => void;
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
  streaming = false,
  citations,
  onViewPage,
}: MessageBubbleProps) {
  const handleCitationClick = (index: number) => {
    // Scroll to the source card with matching id
    const el = document.getElementById(`citation-${index}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className={`${styles.bubble} ${styles[role] ?? ""} ${streaming ? styles.streaming : ""}`}>
      <span className={styles.label}>{role === "user" ? "You" : "Tutor"}</span>
      {renderContentWithCitations(content, citations, handleCitationClick)}
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
