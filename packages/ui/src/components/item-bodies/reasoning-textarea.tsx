import styles from "./reasoning-textarea.module.css";

export interface ReasoningTextareaProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** When true, shows validation hint if the textarea is empty. */
  showValidation?: boolean;
}

/**
 * Freetext reasoning justification rendered below choice controls when
 * `item.requireReasoning === true`. The reasoning text travels in
 * `AssignmentResponse.work` (same field as `workRubric` shown-work, which
 * is mutually exclusive at the kind level).
 */
export function ReasoningTextarea({
  id,
  value,
  onChange,
  disabled = false,
  showValidation = false,
}: ReasoningTextareaProps) {
  const isEmpty = value.trim() === "";
  const showHint = showValidation && isEmpty;

  return (
    <div className={styles.wrapper}>
      <label htmlFor={id} className={`${styles.label} ${styles.required}`}>
        explain your thinking
      </label>
      <textarea
        id={id}
        className={`${styles.textarea} ${showHint ? styles.empty : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        placeholder="explain your thinking…"
        aria-required
        aria-invalid={showHint}
      />
      {showHint && (
        <p className={styles.emptyHint} role="alert">
          · explanation required
        </p>
      )}
    </div>
  );
}
