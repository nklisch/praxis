/**
 * LockServiceImpl integration tests.
 *
 * Uses a real migrated SQLite database via useTempDb() so the lock_state
 * table is available. Each test gets a fresh DB and a fresh service instance.
 */
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { LockServiceImpl } from "../services/lock-service.js";

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const dbCtx = useTempDb();

function makeService() {
  const { db } = openDb({ path: dbCtx.dbPath });
  return new LockServiceImpl({ db, log: MOCK_LOG });
}

// ─── isSet / isUnlocked when no lock exists ──────────────────────────────────

describe("LockServiceImpl — no lock set", () => {
  it("isSet returns false when no lock row exists", async () => {
    const svc = makeService();
    expect(await svc.isSet()).toBe(false);
  });

  it("isUnlocked returns true when no lock is set (no friction for solo users)", async () => {
    const svc = makeService();
    expect(await svc.isUnlocked()).toBe(true);
  });

  it("unlock with no lock set returns { ok: true } and leaves isUnlocked true", async () => {
    const svc = makeService();
    const result = await svc.unlock({ code: "anything" });
    expect(result.ok).toBe(true);
    expect(await svc.isUnlocked()).toBe(true);
  });

  it("clearLock with no lock is idempotent (no-op)", async () => {
    const svc = makeService();
    await expect(svc.clearLock({ currentCode: "1234" })).resolves.toBeUndefined();
  });
});

// ─── setLockCode validation ───────────────────────────────────────────────────

describe("LockServiceImpl — code policy", () => {
  it("rejects codes shorter than 4 digits", async () => {
    const svc = makeService();
    await expect(svc.setLockCode({ code: "123" })).rejects.toThrow("4–8 digits");
  });

  it("rejects codes longer than 8 digits", async () => {
    const svc = makeService();
    await expect(svc.setLockCode({ code: "123456789" })).rejects.toThrow("4–8 digits");
  });

  it("rejects non-digit codes", async () => {
    const svc = makeService();
    await expect(svc.setLockCode({ code: "abcd" })).rejects.toThrow("4–8 digits");
    await expect(svc.setLockCode({ code: "12ab" })).rejects.toThrow("4–8 digits");
  });

  it("accepts 4-digit codes", async () => {
    const svc = makeService();
    await expect(svc.setLockCode({ code: "1234" })).resolves.toBeUndefined();
  });

  it("accepts 8-digit codes", async () => {
    const svc = makeService();
    await expect(svc.setLockCode({ code: "12345678" })).resolves.toBeUndefined();
  });
});

// ─── Full lifecycle ───────────────────────────────────────────────────────────

describe("LockServiceImpl — full lifecycle", () => {
  it("setLockCode → isSet true, isUnlocked true (session unlocked after set)", async () => {
    const svc = makeService();
    await svc.setLockCode({ code: "1234" });
    expect(await svc.isSet()).toBe(true);
    // Setting a lock leaves the current process unlocked for the session.
    expect(await svc.isUnlocked()).toBe(true);
  });

  it("lock() → isUnlocked false", async () => {
    const svc = makeService();
    await svc.setLockCode({ code: "1234" });
    await svc.lock();
    expect(await svc.isUnlocked()).toBe(false);
  });

  it("unlock with correct code → { ok: true }, isUnlocked true", async () => {
    const svc = makeService();
    await svc.setLockCode({ code: "1234" });
    await svc.lock();
    const result = await svc.unlock({ code: "1234" });
    expect(result.ok).toBe(true);
    expect(await svc.isUnlocked()).toBe(true);
  });

  it("unlock with wrong code → { ok: false }, isUnlocked stays false", async () => {
    const svc = makeService();
    await svc.setLockCode({ code: "1234" });
    await svc.lock();
    const result = await svc.unlock({ code: "9999" });
    expect(result.ok).toBe(false);
    expect(await svc.isUnlocked()).toBe(false);
  });

  it("clearLock with correct code → isSet false", async () => {
    const svc = makeService();
    await svc.setLockCode({ code: "1234" });
    await svc.clearLock({ currentCode: "1234" });
    expect(await svc.isSet()).toBe(false);
    expect(await svc.isUnlocked()).toBe(true);
  });

  it("clearLock with wrong code throws", async () => {
    const svc = makeService();
    await svc.setLockCode({ code: "1234" });
    await expect(svc.clearLock({ currentCode: "9999" })).rejects.toThrow(
      "Current lock code does not match",
    );
    // Lock is still set after failed clearLock.
    expect(await svc.isSet()).toBe(true);
  });

  it("new service instance inherits persisted lock state from DB", async () => {
    const svc1 = makeService();
    await svc1.setLockCode({ code: "5678" });

    // A second service instance (same DB) sees the persisted row.
    const svc2 = makeService();
    expect(await svc2.isSet()).toBe(true);
    // But the in-process unlocked flag is NOT shared (new instance = locked).
    expect(await svc2.isUnlocked()).toBe(false);
  });

  it("replaces existing code with setLockCode", async () => {
    const svc = makeService();
    await svc.setLockCode({ code: "1234" });
    await svc.lock();

    // Replace code.
    await svc.setLockCode({ code: "5678" });
    await svc.lock();

    // Old code no longer works.
    const oldResult = await svc.unlock({ code: "1234" });
    expect(oldResult.ok).toBe(false);

    // New code works.
    const newResult = await svc.unlock({ code: "5678" });
    expect(newResult.ok).toBe(true);
  });
});
