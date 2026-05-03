import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// ============================================
// LOGGER
// ============================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

let debugEnabled = process.env.CLAUDE_SDK_DEBUG === "1" || process.env.DEBUG === "claude-code";

export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

export function createLogger(component: string): Logger {
  return {
    debug(msg, data) {
      if (debugEnabled) {
        console.debug(`[claude-code:${component}] ${msg}`, data ?? "");
      }
    },
    info(msg, data) {
      console.info(`[claude-code:${component}] ${msg}`, data ?? "");
    },
    warn(msg, data) {
      console.warn(`[claude-code:${component}] ${msg}`, data ?? "");
    },
    error(msg, data) {
      console.error(`[claude-code:${component}] ${msg}`, data ?? "");
    },
  };
}

// ============================================
// ID GENERATION
// ============================================

export function generateId(prefix = "sess"): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

// ============================================
// TEMP FILE HELPERS
// ============================================

export async function writeTempJson(data: unknown, prefix = "claude-sdk"): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  const filePath = path.join(tmpDir, "config.json");
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  return filePath;
}

export async function cleanupTempDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.rm(dir, { recursive: true, force: true });
}

// ============================================
// DEFERRED PROMISE
// ============================================

export interface DeferredPromise<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
