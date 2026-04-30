import { useState } from "react";
import styles from "./note-editor-feynman.module.css";

export interface FeynmanBody {
  kind: "feynman";
  explanation: string;
  followUps: string[];
}

export interface NoteEditorFeynmanProps {
  body: FeynmanBody;
  onChange: (body: FeynmanBody) => void;
}

/**
 * Feynman note editor — explanation textarea + follow-up questions list.
 * The Feynman technique: explain the concept simply, then identify gaps
 * (follow-up questions) that reveal what you don't yet understand.
 */
export function NoteEditorFeynman({ body, onChange }: NoteEditorFeynmanProps) {
  const [localBody, setLocalBody] = useState<FeynmanBody>(body);

  const emit = (updated: FeynmanBody) => {
    setLocalBody(updated);
    onChange(updated);
  };

  const handleExplanationChange = (val: string) => {
    emit({ ...localBody, explanation: val });
  };

  const handleFollowUpChange = (i: number, val: string) => {
    const followUps = [...localBody.followUps];
    followUps[i] = val;
    emit({ ...localBody, followUps });
  };

  const addFollowUp = () => {
    emit({ ...localBody, followUps: [...localBody.followUps, ""] });
  };

  const removeFollowUp = (i: number) => {
    emit({ ...localBody, followUps: localBody.followUps.filter((_, idx) => idx !== i) });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.section}>
        <label className={styles.sectionLabel} htmlFor="feynman-explanation">
          Explanation
          <span className={styles.hint}> — write as if teaching a 12-year-old</span>
        </label>
        <textarea
          id="feynman-explanation"
          className={styles.explanationTextarea}
          value={localBody.explanation}
          onChange={(e) => handleExplanationChange(e.target.value)}
          placeholder="Explain the concept in plain language…"
          rows={8}
        />
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>
          Follow-up questions
          <span className={styles.hint}> — gaps in your understanding</span>
        </span>

        {localBody.followUps.length > 0 && (
          <ul className={styles.followUpList}>
            {localBody.followUps.map((q, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: follow-ups indexed by position
              <li key={i} className={styles.followUpItem}>
                <textarea
                  className={styles.followUpTextarea}
                  value={q}
                  onChange={(e) => handleFollowUpChange(i, e.target.value)}
                  placeholder="What do I still not understand?"
                  rows={2}
                  aria-label={`Follow-up ${i + 1}`}
                />
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeFollowUp(i)}
                  aria-label={`Remove follow-up ${i + 1}`}
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className={styles.addBtn} onClick={addFollowUp}>
          + Add follow-up
        </button>
      </div>
    </div>
  );
}
