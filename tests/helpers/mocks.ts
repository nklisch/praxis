import type { Logger, SecretStorage } from "@praxis/core/types";
import { SecretStorageError } from "@praxis/core/types";
import { vi } from "vitest";

/**
 * In-memory SecretStorage for tests. Uses a base64 roundtrip — not real
 * crypto, but satisfies the port contract. Tests that need to exercise
 * decryption failure can use `unavailableSecretStorage()` or construct
 * a custom variant that returns null from decrypt.
 */
export function inMemorySecretStorage(): SecretStorage {
  return {
    isAvailable: () => true,
    encrypt: (plaintext) => Buffer.from(plaintext, "utf8").toString("base64"),
    decrypt: (b64) => {
      try {
        return Buffer.from(b64, "base64").toString("utf8");
      } catch {
        return null;
      }
    },
  };
}

/**
 * SecretStorage variant where `isAvailable()` returns false. All encrypt
 * calls throw `SecretStorageError("unavailable")`; decrypt returns null.
 * Use to test the "refuse to save when keyring is absent" path.
 */
export function unavailableSecretStorage(): SecretStorage {
  return {
    isAvailable: () => false,
    encrypt: () => {
      throw new SecretStorageError("test: safeStorage unavailable", "unavailable");
    },
    decrypt: () => null,
  };
}

/**
 * Quiet Logger that drops every call. Use when testing components that
 * accept a Logger but the test doesn't assert on log output.
 */
export function noopLogger(): import("@praxis/core/types").Logger {
  const instance: import("@praxis/core/types").Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => instance,
  };
  return instance;
}

/**
 * Vitest spy Logger for tests that assert on log output via vi.fn() spies.
 * The spies live under `_spies` so they don't pollute the `Logger` interface.
 * Also includes `ingestRendererRecord` and `shutdown` spies for desktop
 * main-process contexts (MainLogger superset).
 *
 * Use when tests need `expect(logger._spies.warn).toHaveBeenCalledWith(...)`.
 * For tests that only need a quiet logger with no assertions, use `noopLogger`.
 */
export function makeSpyLogger(): Logger & {
  /** Spies on each Logger method plus the MainLogger extras. Access these in assertions. */
  _spies: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    ingestRendererRecord: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
  };
  /**
   * MainLogger superset methods — exposed on the object so the spy logger
   * can be passed directly to desktop main-process code that accepts MainLogger.
   */
  ingestRendererRecord: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
} {
  const spies = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    ingestRendererRecord: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  const logger = {
    debug: spies.debug,
    info: spies.info,
    warn: spies.warn,
    error: spies.error,
    child: vi.fn(() => makeSpyLogger()),
    ingestRendererRecord: spies.ingestRendererRecord,
    shutdown: spies.shutdown,
    _spies: spies,
  };
  return logger;
}

/**
 * No-op LockService. Returns "always unlocked, no lock set".
 * Use when testing components that accept ServiceDeps but don't exercise
 * the lock gate (the lock is mandatory on ServiceDeps since Phase 11).
 */
export function noopLockService(): import("@praxis/core/types").LockService {
  return {
    isSet: async () => false,
    isUnlocked: async () => true,
    setLockCode: async () => {},
    unlock: async () => ({ ok: true }),
    lock: async () => {},
    clearLock: async () => {},
  };
}

/**
 * No-op DocumentScopesService. Returns empty lists for all read methods
 * and no-op results for mutations.
 * Use when testing components that accept ServiceDeps but don't exercise
 * scope-document attachment logic (the field became mandatory in Phase 16).
 */
export function noopDocumentScopes(): import("@praxis/core/types").DocumentScopesService {
  return {
    listForScope: async () => [],
    listForScopeDetailed: async () => [],
    attach: async () => ({ attached: false }),
    detach: async () => ({ detached: false }),
    attachMany: async () => ({ newlyAttached: [] }),
    listScopesForDocument: async () => [],
    promoteScope: async () => ({ promoted: [] }),
    listOrphaned: async () => [],
  };
}

/**
 * Recording Logger for tests that want to assert on emitted records.
 * Returns a Logger augmented with a `records` array that captures every call.
 */
export function recordingLogger(): import("@praxis/core/types").Logger & {
  records: Array<{
    level: string;
    message: string;
    fields?: Record<string, unknown>;
    bindings?: Record<string, unknown>;
  }>;
} {
  const records: Array<{
    level: string;
    message: string;
    fields?: Record<string, unknown>;
    bindings?: Record<string, unknown>;
  }> = [];
  const make = (bindings: Record<string, unknown>): import("@praxis/core/types").Logger => ({
    debug: (m, f) =>
      records.push({
        level: "debug",
        message: m,
        ...(f && { fields: f }),
        ...(Object.keys(bindings).length && { bindings }),
      }),
    info: (m, f) =>
      records.push({
        level: "info",
        message: m,
        ...(f && { fields: f }),
        ...(Object.keys(bindings).length && { bindings }),
      }),
    warn: (m, f) =>
      records.push({
        level: "warn",
        message: m,
        ...(f && { fields: f }),
        ...(Object.keys(bindings).length && { bindings }),
      }),
    error: (m, f) =>
      records.push({
        level: "error",
        message: m,
        ...(f && { fields: f }),
        ...(Object.keys(bindings).length && { bindings }),
      }),
    child: (b) => make({ ...bindings, ...b }),
  });
  return Object.assign(make({}), { records });
}
