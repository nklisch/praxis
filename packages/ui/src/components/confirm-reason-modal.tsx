import { type FormEvent, useRef, useState } from "react";
import styles from "./confirm-reason-modal.module.css";
import { Modal } from "./modal.js";

export interface ConfirmReasonModalProps {
  title: string;
  description: string;
  reasonLabel?: string;
  reasonRequired?: boolean;
  confirmLabel?: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Generic confirmation modal that collects an optional reason.
 * Used for destructive actions (lesson.delete, gate.delete, memory.reset_concept, etc.)
 * so the reason flows through to the configurator audit log.
 */
export function ConfirmReasonModal({
  title,
  description,
  reasonLabel = "Reason (optional)",
  reasonRequired = false,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
}: ConfirmReasonModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (reasonRequired && !reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} initialFocus={textareaRef} ariaLabel={title} maxWidth="460px">
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          {reasonLabel}
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            disabled={submitting}
            placeholder="Enter a reason…"
          />
        </label>

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
            className={styles.confirmBtn}
            disabled={submitting || (reasonRequired && !reason.trim())}
          >
            {submitting ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
