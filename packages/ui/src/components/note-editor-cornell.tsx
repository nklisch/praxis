import { useCallback, useRef, useState } from "react";
import styles from "./note-editor-cornell.module.css";

export interface CornellBody {
  kind: "cornell";
  questions: string[];
  details: string[];
  summary: string;
}

export interface NoteEditorCornellProps {
  body: CornellBody;
  onChange: (body: CornellBody) => void;
  /** Called with the row index (as a string) when the spawn button is clicked. */
  onSpawnFromCue?: (cueId: string) => void;
}

/**
 * Cornell note editor — 3-zone layout per the locked mock:
 *
 *   ┌──────────────┬──────────────────────────────────────────┐
 *   │ ◆ Cues (240px)│ ◆ Notes (flex)                          │
 *   │               │                                          │
 *   │  [cue 0]──────┼──► ◆ marker 0 + detail textarea          │
 *   │  [cue 1]──────┼──► ◆ marker 1 + detail textarea          │
 *   │  + add a cue  │                                          │
 *   ├───────────────┴──────────────────────────────────────────┤
 *   │ ¶ Summary (full-width band)                              │
 *   └──────────────────────────────────────────────────────────┘
 *
 * `questions[]` ↔ cue column; `details[]` ↔ notes column (parallel arrays).
 * Clicking a cue scrolls its ◆ marker into view. Clicking a ◆ marker scrolls
 * its cue button into view and briefly highlights it.
 *
 * The parent (note-editor-page) calls onSave with the body via onChange.
 */
export function NoteEditorCornell({ body, onChange, onSpawnFromCue }: NoteEditorCornellProps) {
  const [localBody, setLocalBody] = useState<CornellBody>(body);
  const [activeCueIdx, setActiveCueIdx] = useState<number | null>(null);

  // Refs for scrolling: cue wrappers + marker wrappers indexed by row.
  const cueRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const markerRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const emit = (updated: CornellBody) => {
    setLocalBody(updated);
    onChange(updated);
  };

  const handleQuestionChange = (i: number, val: string) => {
    const questions = [...localBody.questions];
    questions[i] = val;
    emit({ ...localBody, questions });
  };

  const handleDetailChange = (i: number, val: string) => {
    const details = [...localBody.details];
    details[i] = val;
    emit({ ...localBody, details });
  };

  const handleSummaryChange = (val: string) => {
    emit({ ...localBody, summary: val });
  };

  const addRow = () => {
    emit({
      ...localBody,
      questions: [...localBody.questions, ""],
      details: [...localBody.details, ""],
    });
  };

  const removeRow = (i: number) => {
    const questions = localBody.questions.filter((_, idx) => idx !== i);
    const details = localBody.details.filter((_, idx) => idx !== i);
    // Clean up refs for removed index.
    cueRefs.current.delete(i);
    markerRefs.current.delete(i);
    emit({ ...localBody, questions, details });
  };

  /** Click a cue button → scroll matching ◆ marker into view. */
  const handleCueClick = useCallback((i: number) => {
    setActiveCueIdx(i);
    const marker = markerRefs.current.get(i);
    if (marker) {
      marker.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  /** Click or focus a ◆ marker → scroll matching cue button into view. */
  const handleMarkerActivate = useCallback((i: number) => {
    setActiveCueIdx(i);
    const cue = cueRefs.current.get(i);
    if (cue) {
      cue.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  const rowCount = Math.max(localBody.questions.length, localBody.details.length);

  return (
    <div className={styles.editor}>
      <div className={styles.threeZone}>
        {/* ── Left: Cue column ── */}
        <aside className={styles.cueColumn}>
          <div className={styles.zoneLabel}>
            <span className={styles.markerGlyph}>◆</span> Cues
          </div>

          <ul className={styles.cueList}>
            {Array.from({ length: rowCount }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cue list indexed by position
              <li key={i} className={styles.cueItem}>
                {/* div instead of button avoids nesting interactive content (textarea)
                    inside a button, which is invalid per the HTML5 content model. */}
                {/* biome-ignore lint/a11y/useSemanticElements: <button> cannot contain <textarea> (interactive content) per HTML5; role="button" on div is the correct workaround */}
                <div
                  ref={(el) => {
                    if (el) cueRefs.current.set(i, el);
                    else cueRefs.current.delete(i);
                  }}
                  role="button"
                  tabIndex={0}
                  className={`${styles.cueButton} ${activeCueIdx === i ? styles.cueButtonActive : ""}`}
                  onClick={() => handleCueClick(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleCueClick(i);
                    }
                  }}
                  aria-label={`Cue ${i + 1}`}
                  title="Click to jump to this marker in the notes"
                >
                  <textarea
                    className={styles.cueTextarea}
                    value={localBody.questions[i] ?? ""}
                    onChange={(e) => handleQuestionChange(i, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Question or cue…"
                    rows={3}
                    aria-label={`Question ${i + 1}`}
                  />
                </div>

                <div className={styles.cueRowActions}>
                  {onSpawnFromCue !== undefined && (
                    <button
                      type="button"
                      className={styles.spawnBtn}
                      onClick={() => onSpawnFromCue(String(i))}
                      aria-label={`Talk to Praxis about row ${i + 1}`}
                      title="Talk to Praxis about this"
                    >
                      ▶
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeRow(i)}
                    aria-label={`Remove row ${i + 1}`}
                    title="Remove row"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <button type="button" className={styles.addCueBtn} onClick={addRow}>
            + add a cue
          </button>
        </aside>

        {/* ── Right: Notes column ── */}
        <div className={styles.notesColumn}>
          <div className={styles.zoneLabel}>
            <span className={styles.markerGlyph}>◆</span> Notes
          </div>

          <div className={styles.notesList}>
            {Array.from({ length: rowCount }, (_, i) => (
              <div // biome-ignore lint/suspicious/noArrayIndexKey: notes indexed by position
                key={i}
                ref={(el) => {
                  if (el) markerRefs.current.set(i, el);
                  else markerRefs.current.delete(i);
                }}
                className={`${styles.notesEntry} ${activeCueIdx === i ? styles.notesEntryActive : ""}`}
              >
                {/* ◆ marker — click activates + scrolls to cue */}
                <button
                  type="button"
                  className={styles.cueMarker}
                  onClick={() => handleMarkerActivate(i)}
                  aria-label={`Jump to cue ${i + 1}`}
                  title="Jump to cue"
                  data-cue-id={String(i)}
                >
                  ◆
                </button>
                <textarea
                  className={styles.detailTextarea}
                  value={localBody.details[i] ?? ""}
                  onChange={(e) => handleDetailChange(i, e.target.value)}
                  placeholder="Notes and details…"
                  rows={4}
                  aria-label={`Detail ${i + 1}`}
                />
              </div>
            ))}

            {rowCount === 0 && (
              <p className={styles.emptyNotes}>Add a cue to start taking notes.</p>
            )}
          </div>
        </div>

        {/* ── Bottom: Summary band ── */}
        <div className={styles.summaryBand}>
          <label className={styles.summaryLabel} htmlFor="cornell-summary">
            <span className={styles.summaryGlyph}>¶</span> Summary
          </label>
          <textarea
            id="cornell-summary"
            className={styles.summaryTextarea}
            value={localBody.summary}
            onChange={(e) => handleSummaryChange(e.target.value)}
            placeholder="Summarise the key ideas in your own words…"
            rows={4}
            aria-label="Summary"
          />
        </div>
      </div>
    </div>
  );
}
