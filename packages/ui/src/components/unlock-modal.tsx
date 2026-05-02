import { type FormEvent, useRef, useState } from "react";
import { useLock } from "../hooks/use-lock.js";
import { COPY } from "../lib/copy.js";
import { Modal } from "./modal.js";
import styles from "./unlock-modal.module.css";

export interface UnlockModalProps {
  onClose: () => void;
  /** Called after successful unlock so parent can react (e.g. navigate to /configure). */
  onUnlocked?: () => void;
}

/**
 * Modal dialog for unlocking the configure surface.
 *
 * Renders a numeric code input, shows "Wrong code, try again" on failure,
 * and closes + calls onUnlocked() on success.
 */
export function UnlockModal({ onClose, onUnlocked }: UnlockModalProps) {
  const { unlock } = useLock();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await unlock(code.trim());
      if (result.ok) {
        onUnlocked?.();
        onClose();
      } else {
        setError(COPY.error.generic("unlock the configurator"));
        setCode("");
        inputRef.current?.focus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : COPY.error.unknown);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} initialFocus={inputRef} ariaLabel="Unlock configure">
      <span className={styles.ornament} aria-hidden="true">
        ⁂
      </span>
      <span className={styles.kicker}>UNLOCK</span>
      <h2 className={styles.title}>unlock configure</h2>
      <p className={styles.description}>Enter your lock code to access the configure surface.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          className={styles.input}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="Enter code"
          disabled={submitting}
          aria-label="Lock code"
          autoComplete="off"
        />

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className={styles.unlockBtn} disabled={!code.trim() || submitting}>
            {submitting ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
