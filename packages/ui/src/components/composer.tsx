import { type FormEvent, useState } from "react";
import styles from "./composer.module.css";

export interface ComposerProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled = false }: ComposerProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    onSend(trimmed);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <textarea
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e as unknown as FormEvent);
          }
        }}
        placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
        rows={3}
        disabled={disabled}
      />
      <button type="submit" className={styles.sendButton} disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
}
