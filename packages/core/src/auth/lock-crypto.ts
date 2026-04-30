/**
 * Lock crypto helpers — scrypt-based hashing for the local lock code.
 *
 * Threat model (per SPEC.md + UX.md): the lock is a UX gate, not a security
 * boundary. It defends against a child or casual user accessing configure mode,
 * not a determined attacker with filesystem access. Scrypt (Node built-in)
 * is more than adequate; Argon2id would add a native dep for no meaningful gain.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";

const SCRYPT_KEY_LEN = 64;
// N=16384 (2^14), r=8, p=1 — conservative but fast enough for a UX gate.
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

/** Promisified scrypt that forwards the options object (Node types for promisify don't cover overloads). */
function scrypt(password: string, salt: string, keyLen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keyLen, SCRYPT_OPTS, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Generate a random 32-hex-char salt.
 * Called once per lock-code set; stored in the lockState row alongside the hash.
 */
export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Derive a stable install identifier from the first non-internal network MAC
 * address. Falls back to `host-<platform>-<arch>` when no MAC is found.
 *
 * Used as the lockState row PK. Stable across restarts on the same machine.
 * Note: if the machine's network config changes, the install ID changes, but the
 * lock still validates because hashing uses the SALT (stored per-row), not the
 * install ID directly.
 */
export function getInstallId(): string {
  const macs: string[] = [];
  for (const ifaceList of Object.values(networkInterfaces())) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        macs.push(iface.mac);
      }
    }
  }
  const firstMac = macs[0];
  if (firstMac !== undefined) return firstMac;
  return `host-${process.platform}-${process.arch}`;
}

/**
 * Hash a lock code with scrypt. Returns a 128-hex-char string (64-byte key).
 * The salt must be unique per install (use `generateSalt()` once and persist it).
 */
export async function hashCode(code: string, salt: string): Promise<string> {
  const buf = await scrypt(code, salt, SCRYPT_KEY_LEN);
  return buf.toString("hex");
}

/**
 * Constant-time verify: hash `code` with `salt` and compare to `expectedHex`.
 * Uses `timingSafeEqual` to prevent timing attacks (even though we're only
 * defending against a UX-gate threat model — correctness matters regardless).
 */
export async function verifyCode(
  code: string,
  salt: string,
  expectedHex: string,
): Promise<boolean> {
  const expected = Buffer.from(expectedHex, "hex");
  // Guard: if expectedHex is empty or wrong length, scrypt would still run —
  // check length first to avoid timingSafeEqual length mismatch.
  if (expected.length !== SCRYPT_KEY_LEN) return false;
  const buf = await scrypt(code, salt, SCRYPT_KEY_LEN);
  return timingSafeEqual(buf, expected);
}
