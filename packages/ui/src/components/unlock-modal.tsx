import { type FormEvent, useEffect, useRef, useState } from "react";
import { useLock } from "../hooks/use-lock.js";
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

  // Focus the input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

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
        setError("Wrong code, try again.");
        setCode("");
        inputRef.current?.focus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Unlock configure"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Unlock Configure</h2>
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
            <button
              type="submit"
              className={styles.unlockBtn}
              disabled={!code.trim() || submitting}
            >
              {submitting ? "Unlocking…" : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
