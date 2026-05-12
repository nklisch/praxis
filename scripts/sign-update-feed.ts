#!/usr/bin/env tsx
/**
 * Sign an update-feed JSON file with the maintainer's Ed25519 private key.
 * Outputs the detached signature as base64 to a `.sig` file alongside the
 * feed file.
 *
 * Usage:
 *   PRAXIS_UPDATE_FEED_PRIVATE_KEY_FILE=/secrets/update-feed-private.pem \
 *     pnpm script:sign-update-feed path/to/feed.json
 *
 * Produces `path/to/feed.json.sig`. Both files must be published together
 * at the same URL base — the app fetches `<PRAXIS_UPDATE_FEED_URL>.sig` for
 * the detached signature.
 *
 * Key generation (one-time):
 *   openssl genpkey -algorithm Ed25519 -out update-feed-private.pem
 *   openssl pkey -in update-feed-private.pem -pubout -outform DER \
 *     | tail -c 32 | base64
 *   # ^ copy that base64 output into UPDATE_FEED_PUBLIC_KEY_BASE64 in
 *   #   packages/core/src/services/update-feed-public-key.ts
 */
import { createPrivateKey, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

async function main(): Promise<void> {
  const feedPath = process.argv[2];
  if (!feedPath) {
    console.error("Usage: sign-update-feed.ts <feed.json>");
    console.error(
      "Set PRAXIS_UPDATE_FEED_PRIVATE_KEY_FILE to the path of the Ed25519 PEM-encoded private key.",
    );
    process.exit(1);
  }

  const keyPath = process.env.PRAXIS_UPDATE_FEED_PRIVATE_KEY_FILE;
  if (!keyPath) {
    console.error("Error: PRAXIS_UPDATE_FEED_PRIVATE_KEY_FILE env var is not set.");
    console.error(
      "Set it to the path of the Ed25519 PEM-encoded private key (e.g., /secrets/update-feed-private.pem).",
    );
    console.error("The private key must never appear in command-line args or shell history.");
    process.exit(1);
  }

  const feedBytes = await readFile(feedPath);
  const keyPem = await readFile(keyPath, "utf8");
  const privateKey = createPrivateKey({ key: keyPem, format: "pem" });

  // Ed25519 sign produces a 64-byte detached signature.
  // The algorithm is implicit from the key type — pass null as the algorithm.
  const sigBytes = sign(null, feedBytes, privateKey);
  if (sigBytes.length !== 64) {
    throw new Error(
      `Unexpected signature length: expected 64 bytes, got ${sigBytes.length}. Is the key really Ed25519?`,
    );
  }

  const sigPath = `${feedPath}.sig`;
  await writeFile(sigPath, sigBytes.toString("base64"), "utf8");
  console.log(
    `Signed: ${feedPath} → ${sigPath} (${sigBytes.length}-byte Ed25519 signature, base64-encoded)`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
