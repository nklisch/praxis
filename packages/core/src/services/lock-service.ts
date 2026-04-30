/**
 * LockServiceImpl — local UX-gate lock for the configure surface.
 *
 * Storage: the `lock_state` SQLite table (one row per install).
 * In-process state: a per-instance `unlocked` flag tracks whether the current
 * process has successfully called `unlock()`. Quit-and-relaunch resets it.
 *
 * Phase 11 wires a SINGLE instance via `buildServices`, so the per-instance
 * flag behaves as process-scoped in production. Tests may construct fresh
 * instances to exercise the flag independently.
 */
import { eq } from "drizzle-orm";
import { generateSalt, getInstallId, hashCode, verifyCode } from "../auth/lock-crypto.js";
import type { PraxisDb } from "../db/index.js";
import { lockState } from "../schema.js";
import type { LockService, Logger } from "../types/index.js";

export interface LockServiceDeps {
  db: PraxisDb;
  log: Logger;
}

/** 4–8 digits only. Per SPEC.md + design rationale ("UX gate, not security boundary"). */
const CODE_POLICY = /^\d{4,8}$/;

export class LockServiceImpl implements LockService {
  /** Per-instance unlock flag. Cleared on `lock()`; set on successful `unlock()`. */
  private unlocked = false;

  constructor(private readonly deps: LockServiceDeps) {}

  async isSet(): Promise<boolean> {
    const row = this.readRow();
    return row !== null && row.hashedCode !== null;
  }

  async isUnlocked(): Promise<boolean> {
    // When no lock is set, the configure surface is always accessible.
    if (!(await this.isSet())) return true;
    return this.unlocked;
  }

  async setLockCode(input: { code: string }): Promise<void> {
    if (!CODE_POLICY.test(input.code)) {
      throw new Error(
        `Lock code must be 4–8 digits; got '${input.code}' (length ${input.code.length})`,
      );
    }

    const row = this.readRow();
    // Preserve the existing salt if the row exists — reuse for code replacement.
    const salt = row?.salt ?? generateSalt();
    const installId = row?.installId ?? getInstallId();
    const hashed = await hashCode(input.code, salt);
    const now = new Date();

    if (row) {
      this.deps.db
        .update(lockState)
        .set({ hashedCode: hashed, setAt: now, lockedAt: now })
        .where(eq(lockState.installId, installId))
        .run();
    } else {
      this.deps.db
        .insert(lockState)
        .values({ installId, hashedCode: hashed, salt, setAt: now, lockedAt: now })
        .run();
    }

    // Setting (or replacing) a lock leaves the process unlocked for this session.
    this.unlocked = true;
    this.deps.log.info("lock.set", { installId });
  }

  async unlock(input: { code: string }): Promise<{ ok: boolean }> {
    const row = this.readRow();
    if (!row?.hashedCode) {
      // No lock set → always unlocked.
      this.unlocked = true;
      return { ok: true };
    }

    const ok = await verifyCode(input.code, row.salt, row.hashedCode);
    if (ok) {
      this.unlocked = true;
      this.deps.log.info("lock.unlocked", { installId: row.installId });
    } else {
      this.deps.log.warn("lock.unlock_failed");
    }
    return { ok };
  }

  async lock(): Promise<void> {
    this.unlocked = false;
    this.deps.log.info("lock.locked");
  }

  async clearLock(input: { currentCode: string }): Promise<void> {
    const row = this.readRow();
    if (!row?.hashedCode) {
      // Already cleared — idempotent.
      return;
    }

    const ok = await verifyCode(input.currentCode, row.salt, row.hashedCode);
    if (!ok) {
      throw new Error("Current lock code does not match; clearLock requires the correct code.");
    }

    this.deps.db
      .update(lockState)
      .set({ hashedCode: null, lockedAt: null })
      .where(eq(lockState.installId, row.installId))
      .run();

    this.unlocked = true;
    this.deps.log.info("lock.cleared", { installId: row.installId });
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private readRow(): typeof lockState.$inferSelect | null {
    const rows = this.deps.db.select().from(lockState).all();
    return rows[0] ?? null;
  }
}
