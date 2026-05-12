import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  importUpdateFeedPublicKey,
  isPublicKeyConfigured,
  UPDATE_FEED_PUBLIC_KEY_BASE64,
} from "../update-feed-public-key.js";

describe("isPublicKeyConfigured", () => {
  it("returns false for the empty placeholder constant", () => {
    // Default constant is empty; this test documents and pins the initial state.
    expect(UPDATE_FEED_PUBLIC_KEY_BASE64).toBe("");
    expect(isPublicKeyConfigured()).toBe(false);
  });
});

describe("importUpdateFeedPublicKey", () => {
  it("throws when the constant is empty", async () => {
    // Default constant is empty (no key configured yet).
    await expect(importUpdateFeedPublicKey()).rejects.toThrow(
      "UPDATE_FEED_PUBLIC_KEY_BASE64 is not configured",
    );
  });

  it("imports a valid 32-byte raw Ed25519 public key and returns a CryptoKey", async () => {
    // Generate a real Ed25519 keypair and extract the raw 32-byte public key.
    const { publicKey } = generateKeyPairSync("ed25519");
    const rawPub = publicKey.export({ type: "spki", format: "der" });
    // SPKI wraps the 32-byte raw key in a 12-byte DER prefix → last 32 bytes.
    const rawBytes = rawPub.subarray(rawPub.length - 32);
    const b64 = rawBytes.toString("base64");

    // Call the real function through the test-seam parameter so the full import
    // pipeline (base64 decode → length guard → subtle.importKey) runs end-to-end.
    const cryptoKey = await importUpdateFeedPublicKey(b64);
    expect(cryptoKey.type).toBe("public");
    expect(cryptoKey.algorithm.name).toBe("Ed25519");
    expect(cryptoKey.usages).toContain("verify");
  });

  it("rejects a key that decodes to 31 bytes (one short of required 32)", async () => {
    // 31 bytes — one short — exercises the length-guard branch in the real function.
    const shortKey = Buffer.alloc(31, 0x42).toString("base64");
    await expect(importUpdateFeedPublicKey(shortKey)).rejects.toThrow(
      /must decode to 32 bytes/,
    );
  });

  it("rejects a key that decodes to 33 bytes (one over required 32)", async () => {
    // 33 bytes — one too many — also exercises the length-guard branch.
    const longKey = Buffer.alloc(33, 0x42).toString("base64");
    await expect(importUpdateFeedPublicKey(longKey)).rejects.toThrow(
      /must decode to 32 bytes/,
    );
  });

  it("rejects malformed base64 that produces zero decoded bytes", async () => {
    // Node's Buffer.from(str, "base64") silently ignores invalid characters, so
    // purely-invalid base64 decodes to 0 bytes — which fails the length guard with
    // "must decode to 32 bytes" (not a separate malformed-base64 error).
    await expect(importUpdateFeedPublicKey("!!!not-valid-base64!!!")).rejects.toThrow(
      /must decode to 32 bytes/,
    );
  });
});
