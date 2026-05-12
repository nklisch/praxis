import type { SecretStorage } from "@praxis/core/types";
import { SecretStorageError } from "@praxis/core/types";
import { safeStorage } from "electron";

/**
 * Electron-backed SecretStorage adapter using safeStorage. Lives in the
 * main process; renderer never sees the unencrypted blob.
 *
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: libsecret / kwallet (when available)
 *
 * NOTE: `safeStorage` is only accessible after the `app.ready` event.
 * This adapter is constructed in `buildServices`, which is called after
 * `app.whenReady()`, so the timing is safe.
 */
export class ElectronSafeStorageAdapter implements SecretStorage {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  encrypt(plaintext: string): string {
    if (!this.isAvailable()) {
      throw new SecretStorageError(
        "safeStorage unavailable on this platform (no OS keyring detected). " +
          "Use the PRAXIS_API_KEY environment variable instead.",
        "unavailable",
      );
    }
    try {
      const buf = safeStorage.encryptString(plaintext);
      return buf.toString("base64");
    } catch (err) {
      throw new SecretStorageError(
        `encrypt failed: ${err instanceof Error ? err.message : String(err)}`,
        "encrypt_failed",
      );
    }
  }

  decrypt(ciphertextBase64: string): string | null {
    if (!this.isAvailable()) return null;
    try {
      const buf = Buffer.from(ciphertextBase64, "base64");
      return safeStorage.decryptString(buf);
    } catch {
      // Decryption failure (corrupt blob, key rotation, account migration).
      // Return null so the caller surfaces a re-enter UX instead of crashing.
      return null;
    }
  }
}
