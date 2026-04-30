import { useState } from "react";
import { useLock } from "../hooks/use-lock.js";
import styles from "./lock-icon.module.css";
import { UnlockModal } from "./unlock-modal.js";

/**
 * Nav-level lock icon.
 *
 * States:
 *  - No lock set: shows unlocked icon with tooltip "No lock set"
 *  - Lock set + NOT unlocked this session: shows locked icon; click → UnlockModal
 *  - Lock set + unlocked this session: shows unlocked icon; click → lock()
 */
export function LockIcon() {
  const { isSet, isUnlocked, loading, lock } = useLock();
  const [showModal, setShowModal] = useState(false);

  if (loading) {
    return (
      <span className={styles.icon} title="Loading lock state…" aria-label="Loading lock state">
        ⏳
      </span>
    );
  }

  const isLocked = isSet && !isUnlocked;

  const handleClick = async () => {
    if (!isSet) {
      // No lock configured — do nothing (set lock code is inside /configure settings)
      return;
    }
    if (isLocked) {
      setShowModal(true);
    } else {
      // Unlocked this session: click to lock now
      await lock();
    }
  };

  const tooltip = !isSet
    ? "No lock set — go to Configure to set a lock code"
    : isLocked
      ? "Locked — click to unlock configure"
      : "Unlocked this session — click to lock now";

  const icon = isLocked ? "🔒" : "🔓";
  const label = isLocked ? "Locked — click to unlock" : "Unlocked — click to lock";

  return (
    <>
      <button
        type="button"
        className={styles.icon}
        title={tooltip}
        aria-label={label}
        onClick={handleClick}
      >
        {icon}
      </button>

      {showModal && <UnlockModal onClose={() => setShowModal(false)} />}
    </>
  );
}
