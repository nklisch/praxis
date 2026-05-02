import { useCallback, useEffect, useRef, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./claude-auth-modal.module.css";

export interface ClaudeAuthModalProps {
  /** Called when the user closes the modal without successful sign-in. */
  onClose: () => void;
  /**
   * Called once after a successful sign-in. The chat route uses this to
   * retry session.start.
   */
  onSignedIn: () => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "awaiting_url" }
  | { kind: "url"; url: string }
  | { kind: "succeeded" }
  | { kind: "failed"; message: string }
  | { kind: "canceled" };

export function ClaudeAuthModal({ onClose, onSignedIn }: ClaudeAuthModalProps) {
  const client = usePraxisClient();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);

  // ESC closes the modal (and cancels in-flight login).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelRef.current?.();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Ensure any active login is canceled if the component unmounts.
  useEffect(() => () => cancelRef.current?.(), []);

  const startLogin = useCallback(async () => {
    setPhase({ kind: "starting" });
    const stream = client.claudeAuth.login();
    let openedExternal = false;
    let canceled = false;
    cancelRef.current = () => {
      canceled = true;
    };
    try {
      for await (const event of stream) {
        if (canceled) break;
        switch (event.kind) {
          case "started":
            setPhase({ kind: "awaiting_url" });
            break;
          case "url":
            setPhase({ kind: "url", url: event.url });
            if (!openedExternal) {
              openedExternal = true;
              client.shell.openExternal(event.url).catch(() => {
                // Non-fatal — user can copy the URL from the textarea.
              });
            }
            break;
          case "succeeded":
            setPhase({ kind: "succeeded" });
            onSignedIn();
            return;
          case "failed":
            setPhase({ kind: "failed", message: event.message });
            return;
          case "stdout":
          case "stderr":
            // Diagnostics only; not shown in UI.
            break;
        }
      }
      if (canceled) setPhase({ kind: "canceled" });
    } catch (err) {
      setPhase({
        kind: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      cancelRef.current = null;
    }
  }, [client, onSignedIn]);

  const handleBackdropClick = () => {
    cancelRef.current?.();
    onClose();
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: ESC is handled by the document-level keydown listener in useEffect; the backdrop click is a supplementary mouse affordance
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to Claude"
      onClick={handleBackdropClick}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stops mouse propagation so clicks inside the card do not bubble to the backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard events are handled at the document level via useEffect; this only prevents mouse event propagation */}
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Sign in to Claude</h2>

        {phase.kind === "idle" && (
          <>
            <p className={styles.body}>
              Praxis uses the <code>claude</code> CLI for the Claude Code engine. Sign in with your
              Claude.ai subscription to continue.
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={onClose} className={styles.secondary}>
                Cancel
              </button>
              <button type="button" onClick={startLogin} className={styles.primary}>
                Sign in with Claude.ai
              </button>
            </div>
          </>
        )}

        {(phase.kind === "starting" || phase.kind === "awaiting_url") && (
          <p className={styles.body}>Starting sign-in flow…</p>
        )}

        {phase.kind === "url" && (
          <>
            <p className={styles.body}>
              Browser opened. Complete sign-in there, then return to this window.
            </p>
            <p className={styles.urlNote}>If your browser didn{"'"}t open, copy this URL:</p>
            <textarea
              className={styles.url}
              readOnly
              value={phase.url}
              onClick={(e) => e.currentTarget.select()}
            />
            <div className={styles.actions}>
              <button type="button" onClick={handleBackdropClick} className={styles.secondary}>
                Cancel
              </button>
            </div>
          </>
        )}

        {phase.kind === "succeeded" && <p className={styles.body}>Signed in. Starting chat…</p>}

        {phase.kind === "failed" && (
          <>
            <p className={styles.error} role="alert">
              Sign-in failed: {phase.message}
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={onClose} className={styles.secondary}>
                Close
              </button>
              <button type="button" onClick={startLogin} className={styles.primary}>
                Try again
              </button>
            </div>
          </>
        )}

        {phase.kind === "canceled" && (
          <>
            <p className={styles.body}>Sign-in canceled.</p>
            <div className={styles.actions}>
              <button type="button" onClick={onClose} className={styles.secondary}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
