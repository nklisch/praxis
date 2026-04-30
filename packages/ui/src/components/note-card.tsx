import type { Note, NoteBody, OutlineNode } from "@praxis/core/types";
import { parseNoteBody } from "@praxis/core/types";
import styles from "./note-card.module.css";

export interface NoteCardProps {
  note: Note;
}

/**
 * Read-only display of a note in all 4 formats, rendered inline in chat
 * when the agent calls `note.show`.
 *
 * Switch on body.kind to render the correct format.
 * Cornell: 2-column layout with summary below.
 * Feynman: explanation paragraph + collapsible follow-ups.
 * Outline: nested bullet list.
 * Free: pre-formatted text.
 */
export function NoteCard({ note }: NoteCardProps) {
  let body: NoteBody;
  try {
    body = parseNoteBody(note.format, note.body ?? null);
  } catch {
    return (
      <article className={styles.card}>
        <header className={styles.header}>
          <span className={styles.formatBadge}>{note.format}</span>
        </header>
        <p className={styles.error}>Unable to parse note body.</p>
      </article>
    );
  }

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <span className={styles.formatBadge}>{note.format}</span>
        <time className={styles.timestamp} dateTime={new Date(note.updatedAt).toISOString()}>
          {new Date(note.updatedAt).toLocaleDateString()}
        </time>
      </header>

      <div className={styles.body}>
        {body.kind === "cornell" && <CornellDisplay body={body} />}
        {body.kind === "feynman" && <FeynmanDisplay body={body} />}
        {body.kind === "outline" && <OutlineDisplay body={body} />}
        {body.kind === "free" && <FreeDisplay body={body} />}
      </div>
    </article>
  );
}

// ── Format-specific read-only displays ───────────────────────────────────────

function CornellDisplay({ body }: { body: Extract<NoteBody, { kind: "cornell" }> }) {
  const rowCount = Math.max(body.questions.length, body.details.length);
  return (
    <div className={styles.cornell}>
      <div className={styles.cornellColumns}>
        <div className={styles.cornellCol}>
          <span className={styles.colHeader}>Questions</span>
          {Array.from({ length: rowCount }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: read-only display
            <p key={i} className={styles.cornellCell}>
              {body.questions[i] ?? "—"}
            </p>
          ))}
        </div>
        <div className={styles.cornellCol}>
          <span className={styles.colHeader}>Notes</span>
          {Array.from({ length: rowCount }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: read-only display
            <p key={i} className={styles.cornellCell}>
              {body.details[i] ?? "—"}
            </p>
          ))}
        </div>
      </div>
      {body.summary && (
        <div className={styles.summaryBox}>
          <span className={styles.colHeader}>Summary</span>
          <p className={styles.summaryText}>{body.summary}</p>
        </div>
      )}
    </div>
  );
}

function FeynmanDisplay({ body }: { body: Extract<NoteBody, { kind: "feynman" }> }) {
  return (
    <div className={styles.feynman}>
      <p className={styles.explanation}>{body.explanation}</p>
      {body.followUps.length > 0 && (
        <details className={styles.followUps}>
          <summary className={styles.followUpSummary}>
            {body.followUps.length} follow-up question{body.followUps.length !== 1 ? "s" : ""}
          </summary>
          <ul className={styles.followUpList}>
            {body.followUps.map((q, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: read-only display
              <li key={i} className={styles.followUpItem}>
                {q}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function OutlineDisplay({ body }: { body: Extract<NoteBody, { kind: "outline" }> }) {
  return (
    <div className={styles.outline}>
      <span className={styles.rootLabel}>{body.root.text}</span>
      {body.root.children.length > 0 && <OutlineChildren nodes={body.root.children} depth={1} />}
    </div>
  );
}

function OutlineChildren({ nodes, depth }: { nodes: OutlineNode[]; depth: number }) {
  return (
    <ul className={styles.outlineList} style={{ paddingLeft: `${depth * 1.1}rem` }}>
      {nodes.map((node, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: read-only display
        <li key={i} className={styles.outlineItem}>
          <span>{node.text}</span>
          {node.children.length > 0 && <OutlineChildren nodes={node.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function FreeDisplay({ body }: { body: Extract<NoteBody, { kind: "free" }> }) {
  return <pre className={styles.freeText}>{body.text}</pre>;
}
