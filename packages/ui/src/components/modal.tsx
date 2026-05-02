import { type CSSProperties, type ReactNode, type RefObject, useEffect } from "react";
import styles from "./modal.module.css";

export interface ModalProps {
  /** Called when ESC pressed or backdrop clicked. */
  onClose: () => void;
  /** Optional element to focus on mount (e.g. an input ref). */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Optional aria-label for the dialog. Default: "Dialog". */
  ariaLabel?: string;
  /**
   * Override the modal card's max-width. Uses a CSS custom property so
   * consumers don't reach into the shared module directly.
   * Default: 400px (shared module baseline).
   */
  maxWidth?: string;
  children: ReactNode;
}

/**
 * Editorial modal primitive. Provides backdrop, ESC handler, click-outside-to-close,
 * and ARIA attributes. The visual envelope (.backdrop + .modal) lives in modal.module.css;
 * consumers render their own content inside.
 */
export function Modal({ onClose, initialFocus, ariaLabel, maxWidth, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    initialFocus?.current?.focus();
  }, [initialFocus]);

  const modalStyle: CSSProperties | undefined = maxWidth
    ? ({ "--modal-max-width": maxWidth } as CSSProperties)
    : undefined;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: ESC is handled by the document-level keydown listener in useEffect; the backdrop click is a supplementary mouse affordance
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? "Dialog"}
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stops mouse propagation so clicks inside the card do not bubble to the backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard events are handled at the document level via useEffect; this only prevents mouse event propagation */}
      <div className={styles.modal} style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
