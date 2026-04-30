import styles from "./note-format-picker.module.css";

export type NoteFormat = "cornell" | "feynman" | "outline" | "free";

export interface NoteFormatPickerProps {
  onSelect: (format: NoteFormat) => void;
  onCancel?: () => void;
}

const FORMAT_INFO: Array<{ id: NoteFormat; label: string; description: string; icon: string }> = [
  {
    id: "cornell",
    label: "Cornell",
    description: "Questions / details columns + summary. Best for structured lecture notes.",
    icon: "⊞",
  },
  {
    id: "feynman",
    label: "Feynman",
    description: "Explain it like you're teaching. Identify gaps with follow-up questions.",
    icon: "💡",
  },
  {
    id: "outline",
    label: "Outline",
    description: "Nested bullet points. Good for hierarchical concepts and topic trees.",
    icon: "≡",
  },
  {
    id: "free",
    label: "Free",
    description: "No structure — write anything. Markdown supported.",
    icon: "📝",
  },
];

/**
 * Format picker shown when creating a new note.
 * Each format is explained briefly so the student can pick the right one.
 */
export function NoteFormatPicker({ onSelect, onCancel }: NoteFormatPickerProps) {
  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <h2 className={styles.title}>Choose a note format</h2>
        {onCancel && (
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <ul className={styles.list}>
        {FORMAT_INFO.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className={styles.formatCard}
              onClick={() => onSelect(f.id)}
              aria-label={`Create ${f.label} note`}
            >
              <span className={styles.icon} aria-hidden>
                {f.icon}
              </span>
              <div className={styles.info}>
                <span className={styles.label}>{f.label}</span>
                <span className={styles.description}>{f.description}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
