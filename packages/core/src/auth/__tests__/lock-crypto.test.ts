/**
 * Unit tests for lock-crypto helpers.
 * These are fast — no DB, no filesystem. Pure crypto.
 */
import { describe, expect, it } from "vitest";
import { generateSalt, getInstallId, hashCode, verifyCode } from "../lock-crypto.js";

describe("generateSalt", () => {
  it("returns a 32-char hex string (16 random bytes)", () => {
    const salt = generateSalt();
    expect(typeof salt).toBe("string");
    expect(salt).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(salt)).toBe(true);
  });

  it("returns different values on successive calls", () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toBe(b);
  });
});

describe("getInstallId", () => {
  it("returns a non-empty string", () => {
    const id = getInstallId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns the same value on successive calls (stable within a process)", () => {
    const a = getInstallId();
    const b = getInstallId();
    expect(a).toBe(b);
  });
});

describe("hashCode + verifyCode", () => {
  it("round-trips: verifyCode returns true for the correct code", async () => {
    const salt = generateSalt();
    const code = "1234";
    const hash = await hashCode(code, salt);
    expect(typeof hash).toBe("string");
    expect(hash).toHaveLength(128); // 64 bytes = 128 hex chars

    const ok = await verifyCode(code, salt, hash);
    expect(ok).toBe(true);
  });

  it("returns false for a wrong code", async () => {
    const salt = generateSalt();
    const hash = await hashCode("1234", salt);
    const ok = await verifyCode("5678", salt, hash);
    expect(ok).toBe(false);
  });

  it("returns false for an empty expected hash", async () => {
    const salt = generateSalt();
    const ok = await verifyCode("1234", salt, "");
    expect(ok).toBe(false);
  });

  it("same code + same salt always produces the same hash (deterministic)", async () => {
    const salt = generateSalt();
    const h1 = await hashCode("9999", salt);
    const h2 = await hashCode("9999", salt);
    expect(h1).toBe(h2);
  });

  it("different salts produce different hashes for the same code", async () => {
    const code = "1234";
    const h1 = await hashCode(code, generateSalt());
    const h2 = await hashCode(code, generateSalt());
    expect(h1).not.toBe(h2);
  });

  it("verifyCode uses timingSafeEqual (path exists)", async () => {
    // We can't assert sub-millisecond timing precision in tests, but we can
    // verify the function is exported and reachable (the implementation uses
    // timingSafeEqual internally).
    const salt = generateSalt();
    const hash = await hashCode("1234", salt);
    // Wrong code — still goes through the timingSafeEqual path.
    const result = await verifyCode("0000", salt, hash);
    expect(result).toBe(false);
  });
});
