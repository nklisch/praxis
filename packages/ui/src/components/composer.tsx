import { type FormEvent, forwardRef } from "react";
import { COPY } from "../lib/copy.js";
import styles from "./composer.module.css";

export interface ComposerProps {
  /** Controlled value — parent owns the textarea content. */
  value: string;
  /** Called on every keystroke. */
  onChange: (value: string) => void;
  /**
   * Called on Enter (or send button). The composer does not clear itself;
   * the parent is responsible for calling onChange("") after sending.
   */
  onSend: (message: string) => void;
  disabled?: boolean;
}

/**
 * Dumb controlled composer textarea. Value and clearing are owned by the
 * parent so external surfaces (the chip rail) can prefill the textarea.
 *
 * A ref is forwarded to the underlying <textarea> so the parent can call
 * .focus() after a chip prefill without an internal imperative handle.
 */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { value, onChange, onSend, disabled = false },
  ref,
) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <textarea
        ref={ref}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e as unknown as FormEvent);
          }
        }}
        placeholder={COPY.composer.placeholder}
        rows={3}
        disabled={disabled}
      />
      <button type="submit" className={styles.sendButton} disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
});
