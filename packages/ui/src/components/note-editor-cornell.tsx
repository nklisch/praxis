import { useState } from "react";
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
}

/**
 * Cornell note editor — three regions: questions column, details column, summary.
 * "+ Add row" extends both questions and details arrays together.
 * The parent (note-editor-page) calls onSave with the body via onChange.
 */
export function NoteEditorCornell({ body, onChange }: NoteEditorCornellProps) {
  const [localBody, setLocalBody] = useState<CornellBody>(body);

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
    emit({ ...localBody, questions, details });
  };

  const rowCount = Math.max(localBody.questions.length, localBody.details.length);

  return (
    <div className={styles.editor}>
      <div className={styles.columnsHeader}>
        <span className={styles.colLabel}>Questions</span>
        <span className={styles.colLabel}>Details / Notes</span>
      </div>

      <div className={styles.rows}>
        {Array.from({ length: rowCount }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: cornell rows identified by position
          <div key={i} className={styles.row}>
            <textarea
              className={styles.textarea}
              value={localBody.questions[i] ?? ""}
              onChange={(e) => handleQuestionChange(i, e.target.value)}
              placeholder="Question or cue…"
              rows={3}
              aria-label={`Question ${i + 1}`}
            />
            <textarea
              className={styles.textarea}
              value={localBody.details[i] ?? ""}
              onChange={(e) => handleDetailChange(i, e.target.value)}
              placeholder="Notes and details…"
              rows={3}
              aria-label={`Detail ${i + 1}`}
            />
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
        ))}
      </div>

      <button type="button" className={styles.addBtn} onClick={addRow}>
        + Add row
      </button>

      <div className={styles.summarySection}>
        <label className={styles.summaryLabel} htmlFor="cornell-summary">
          Summary
        </label>
        <textarea
          id="cornell-summary"
          className={`${styles.textarea} ${styles.summaryTextarea}`}
          value={localBody.summary}
          onChange={(e) => handleSummaryChange(e.target.value)}
          placeholder="Summarise the key ideas in your own words…"
          rows={4}
        />
      </div>
    </div>
  );
}
