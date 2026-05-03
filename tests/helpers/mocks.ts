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
