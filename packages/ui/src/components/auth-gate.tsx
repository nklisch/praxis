import { type ReactNode, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStatus } from "../context/auth-context.js";
import { ClaudeAuthModal } from "./claude-auth-modal.js";
import styles from "./auth-gate.module.css";

export interface AuthGateProps {
  /** What renders inside the gate. */
  children: ReactNode;
  /** Called after a successful sign-in; use to retry the failed action. */
  onSignedIn?: () => void;
}

/**
 * Wraps a surface that depends on Claude auth. When the shared auth status
 * shows `needsAuth: true`, renders an editorial banner with a "Sign in"
 * trigger that opens <ClaudeAuthModal />. After successful sign-in, all
 * AuthGate instances clear simultaneously (shared context).
 */
export function AuthGate({ children, onSignedIn }: AuthGateProps) {
  const navigate = useNavigate();
  const { needsAuth, clearAuthRequired } = useAuthStatus();
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {needsAuth && (
        <div className={styles.banner}>
          <span>Not signed in to Claude.</span>
          <button type="button" className={styles.signInButton} onClick={() => setShowModal(true)}>
            Sign in
          </button>
          <button
            type="button"
            className={styles.switchButton}
            onClick={() => navigate({ to: "/settings" })}
          >
            Switch engine
          </button>
        </div>
      )}
      {children}
      {showModal && (
        <ClaudeAuthModal
          onClose={() => setShowModal(false)}
          onSignedIn={() => {
            setShowModal(false);
            clearAuthRequired();
            onSignedIn?.();
          }}
        />
      )}
    </>
  );
}
