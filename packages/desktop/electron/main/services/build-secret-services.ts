import { ClaudeAuthServiceImpl } from "@praxis/core/services";
import type { MainLogger } from "../logger.js";
import { ElectronSafeStorageAdapter } from "../secret-storage.js";

export interface SecretServices {
  secretStorage: ElectronSafeStorageAdapter;
  claudeAuthService: ClaudeAuthServiceImpl;
}

/**
 * Construct Electron-specific secret-storage and Claude CLI auth services.
 *
 * **Must be called after `app.whenReady()`** — `ElectronSafeStorageAdapter`
 * delegates to `safeStorage`, which requires the app to be ready before use.
 * This is guaranteed by the `buildServices()` call site, which is invoked from
 * within the `app.whenReady()` callback in the Electron main process.
 */
export function buildSecretServices(log: MainLogger): SecretServices {
  const secretStorage = new ElectronSafeStorageAdapter();
  const claudeAuthService = new ClaudeAuthServiceImpl({ log });
  return { secretStorage, claudeAuthService };
}
