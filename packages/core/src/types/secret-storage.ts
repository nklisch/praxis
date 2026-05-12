/**
 * Port for at-rest secret storage. Implementations encrypt and decrypt
 * strings using a platform keychain when available; tests use an
 * in-memory base64 roundtrip.
 *
 * The port abstracts over Electron's `safeStorage` (Keychain on macOS,
 * DPAPI on Windows, libsecret on Linux). `@praxis/core` MUST NOT import
 * the Electron API directly — the adapter lives in `@praxis/desktop`.
 */
export interface SecretStorage {
  /**
   * Returns true when encryption is available on this platform.
   * On Linux without a keyring (libsecret / gnome-keyring / kwallet),
   * this returns false. The config layer refuses to save the apiKey
   * when this is false rather than silently storing plaintext.
   */
  isAvailable(): boolean;

  /**
   * Encrypt a plaintext string. Returns a base64-encoded ciphertext
   * blob suitable for storage in `config_kv.value_json`.
   *
   * Throws `SecretStorageError` with code `unavailable` when
   * `isAvailable()` is false. Callers should check availability first.
   */
  encrypt(plaintext: string): string;

  /**
   * Decrypt a base64-encoded ciphertext blob. Returns null on failure
   * (corrupt blob, keyring rotation, account migration). Callers
   * surface a "re-enter API key" UX rather than throwing.
   */
  decrypt(ciphertextBase64: string): string | null;
}

export class SecretStorageError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "encrypt_failed" | "decrypt_failed",
  ) {
    super(message);
    this.name = "SecretStorageError";
  }
}
