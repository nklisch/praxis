/** Phase 11: Client-side lock interface. */
export interface LockClient {
  isSet(): Promise<boolean>;
  isUnlocked(): Promise<boolean>;
  setLockCode(code: string): Promise<void>;
  unlock(code: string): Promise<{ ok: boolean }>;
  lock(): Promise<void>;
  clearLock(currentCode: string): Promise<void>;
}

// ─── Phase 11: LockService ───────────────────────────────────────────────────

/** Server-side lock service — local code-gating. */
export interface LockService {
  /** Whether a lock code is set. */
  isSet(): Promise<boolean>;
  /**
   * Whether the current process has been unlocked.
   * Always true when no lock is set.
   */
  isUnlocked(): Promise<boolean>;
  /** Set/replace the lock code. Throws if the new code fails policy (4–8 digits). */
  setLockCode(input: { code: string }): Promise<void>;
  /** Verify code; on success, marks the current process unlocked. */
  unlock(input: { code: string }): Promise<{ ok: boolean }>;
  /** Lock the current process (clears the unlocked-this-session flag). */
  lock(): Promise<void>;
  /** Clear the lock entirely (factory-reset path). Requires the current code. */
  clearLock(input: { currentCode: string }): Promise<void>;
}
