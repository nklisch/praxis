/**
 * Smoke test for ElectronSafeStorageAdapter.
 *
 * The real `safeStorage` Electron API is only accessible inside a running
 * Electron main process. This test verifies that:
 *   - The adapter is constructible without errors.
 *   - It exposes the correct interface methods.
 *   - `isAvailable()` and `encrypt()`/`decrypt()` are callable (actual
 *     behavior is verified by manual integration when running `pnpm dev`
 *     on each supported platform — macOS Keychain, Windows DPAPI,
 *     Linux libsecret / kwallet).
 *
 * NOTE: If you extend this with real `safeStorage` calls, gate them with
 * `process.env.PRAXIS_RUN_SLOW_TESTS` and `describe.skipIf(...)` following
 * the slow-test-gating pattern — those tests require a running Electron
 * main process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Electron module so the adapter is constructible in Node test context.
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, "utf8"),
    decryptString: (b: Buffer) => b.toString("utf8"),
  },
}));

import { SecretStorageError } from "@praxis/core/types";
import { ElectronSafeStorageAdapter } from "../secret-storage.js";

describe("ElectronSafeStorageAdapter", () => {
  it("is constructible", () => {
    expect(() => new ElectronSafeStorageAdapter()).not.toThrow();
  });

  it("exposes isAvailable, encrypt, decrypt methods", () => {
    const adapter = new ElectronSafeStorageAdapter();
    expect(typeof adapter.isAvailable).toBe("function");
    expect(typeof adapter.encrypt).toBe("function");
    expect(typeof adapter.decrypt).toBe("function");
  });

  it("implements SecretStorage interface: encrypt + decrypt roundtrip", () => {
    const adapter = new ElectronSafeStorageAdapter();
    const plaintext = "sk-test-api-key";
    const blob = adapter.encrypt(plaintext);
    expect(typeof blob).toBe("string");
    const decrypted = adapter.decrypt(blob);
    expect(decrypted).toBe(plaintext);
  });

  it("isAvailable returns true when safeStorage.isEncryptionAvailable returns true", () => {
    const adapter = new ElectronSafeStorageAdapter();
    expect(adapter.isAvailable()).toBe(true);
  });

  it("decrypt returns null on decryption failure instead of throwing", async () => {
    // Temporarily override safeStorage.decryptString to throw.
    const { safeStorage } = await import("electron");
    const original = safeStorage.decryptString;
    // biome-ignore lint/suspicious/noExplicitAny: test override of mocked module
    (safeStorage as any).decryptString = () => {
      throw new Error("simulated keyring rotation");
    };

    const adapter = new ElectronSafeStorageAdapter();
    const result = adapter.decrypt("not-a-real-blob");
    expect(result).toBeNull();

    // biome-ignore lint/suspicious/noExplicitAny: restoring mocked module
    (safeStorage as any).decryptString = original;
  });
});

describe("ElectronSafeStorageAdapter — safeStorage unavailable", () => {
  // Shadow the module-level mock's `isEncryptionAvailable` with one that
  // returns false, then restore it so other tests are unaffected.
  beforeEach(async () => {
    const { safeStorage } = await import("electron");
    vi.spyOn(safeStorage, "isEncryptionAvailable").mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encrypt throws SecretStorageError with code='unavailable' when isEncryptionAvailable returns false", async () => {
    const adapter = new ElectronSafeStorageAdapter();
    expect(() => adapter.encrypt("secret-api-key")).toThrowError(SecretStorageError);
    try {
      adapter.encrypt("secret-api-key");
      expect.fail("expected SecretStorageError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SecretStorageError);
      expect((err as SecretStorageError).code).toBe("unavailable");
    }
  });

  it("decrypt returns null (not throws) when isEncryptionAvailable returns false", async () => {
    const adapter = new ElectronSafeStorageAdapter();
    const result = adapter.decrypt("dGVzdA==");
    expect(result).toBeNull();
  });
});
