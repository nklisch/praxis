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
 * No-op CourseDocumentsService. Returns empty lists for all read methods
 * and no-op results for mutations.
 * Use when testing BootstrapServiceImpl-accepting components that don't
 * exercise course-document attachment logic (the field became mandatory in
 * Phase 16).
 */
export function noopCourseDocuments(): import("@praxis/core/types").CourseDocumentsService {
  return {
    listForCourse: async () => [],
    listForCourseDetailed: async () => [],
    attach: async () => ({ attached: false }),
    detach: async () => ({ detached: false }),
    attachMany: async () => ({ newlyAttached: [] }),
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
