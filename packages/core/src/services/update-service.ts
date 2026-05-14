import { z } from "zod";
import { isAllowedExternalUrl } from "../types/url-allowlist.js";
import type { ServiceDeps } from "./types.js";
import { importUpdateFeedPublicKey, isPublicKeyConfigured } from "./update-feed-public-key.js";

const FEED_URL_ENV = "PRAXIS_UPDATE_FEED_URL";

export const UpdateFeedSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver"),
  releaseDate: z.string().datetime().optional(),
  // Defensive URL allowlist: only http/https. Refuse javascript:, data:, file:,
  // etc. to prevent a compromised feed from delivering a click-targeted injection
  // into the renderer. Shares `isAllowedExternalUrl` with
  // praxis.shell.openExternal in ipc-server.ts so the two surfaces can't drift.
  downloadUrl: z.url().refine(isAllowedExternalUrl, "downloadUrl must be http(s)"),
  releaseNotesUrl: z
    .url()
    .refine(isAllowedExternalUrl, "releaseNotesUrl must be http(s)")
    .optional(),
  /**
   * SHA-256 of the installer file at `downloadUrl`, in lowercase hex (64 chars).
   * Surfaced in the banner for users to manually verify their download via
   * `shasum -a 256` / `sha256sum` / certutil. Optional during the transition
   * window where the maintainer hasn't started publishing it yet.
   */
  installerSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "installerSha256 must be 64-char lowercase hex")
    .optional(),
});

export type UpdateFeed = z.infer<typeof UpdateFeedSchema>;

export type UpdateCheckResult =
  | { status: "disabled" }
  | { status: "up-to-date"; current: string }
  | { status: "available"; current: string; latest: UpdateFeed }
  | { status: "error"; message: string };

export interface UpdateService {
  /**
   * One-shot update check. Returns "disabled" if no `PRAXIS_UPDATE_FEED_URL`
   * env var is set, or if no public key is configured; otherwise fetches the
   * feed bytes, fetches the detached `.sig` file, verifies the Ed25519
   * signature, parses and validates the feed JSON, compares against
   * `currentVersion`, and reports the outcome. Never throws —
   * callers receive a typed result with an explicit error variant.
   */
  checkLatest(currentVersion: string): Promise<UpdateCheckResult>;
}

export class UpdateServiceImpl implements UpdateService {
  constructor(private readonly deps: ServiceDeps) {}

  async checkLatest(currentVersion: string): Promise<UpdateCheckResult> {
    const url = process.env[FEED_URL_ENV];
    if (!url) return { status: "disabled" };

    // No public key bundled yet → disabled. Lets the feature ship in code
    // form before the maintainer generates the keypair.
    if (!isPublicKeyConfigured()) {
      this.deps.log.debug("update-service.disabled.no_public_key");
      return { status: "disabled" };
    }

    // Fetch feed bytes (NOT JSON yet — we need the raw bytes for signature verification).
    let feedBytes: ArrayBuffer;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Praxis-update-check" },
      });
      if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
      feedBytes = await res.arrayBuffer();
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    // Fetch detached signature (sibling URL with .sig appended).
    const sigUrl = `${url}.sig`;
    let sigBase64: string;
    try {
      const res = await fetch(sigUrl, {
        headers: { "User-Agent": "Praxis-update-check" },
      });
      if (!res.ok) {
        this.deps.log.warn("update-service.sig_fetch_failed", {
          status: res.status,
          sigUrl,
        });
        return {
          status: "error",
          message: `signature fetch failed: HTTP ${res.status}`,
        };
      }
      sigBase64 = (await res.text()).trim();
    } catch (err) {
      this.deps.log.warn("update-service.sig_fetch_threw", {
        detail: err instanceof Error ? err.message : String(err),
      });
      return { status: "error", message: "signature fetch failed" };
    }

    // Verify Ed25519 signature over the raw feed bytes.
    let verifyOk = false;
    try {
      const sigBytes = Buffer.from(sigBase64, "base64");
      if (sigBytes.length !== 64) {
        this.deps.log.warn("update-service.sig_malformed", {
          expected: 64,
          got: sigBytes.length,
        });
        return { status: "error", message: "signature malformed" };
      }
      const key = await importUpdateFeedPublicKey();
      verifyOk = await crypto.subtle.verify("Ed25519", key, sigBytes, feedBytes);
    } catch (err) {
      this.deps.log.warn("update-service.verify_threw", {
        detail: err instanceof Error ? err.message : String(err),
      });
      return { status: "error", message: "signature verification error" };
    }
    if (!verifyOk) {
      this.deps.log.warn("update-service.sig_invalid", {
        feedUrl: url,
        detail:
          "signature does not match the bundled public key — feed may be tampered or the maintainer rotated keys",
      });
      return { status: "error", message: "signature verification failed" };
    }

    // Signature verified — now JSON-parse and schema-validate.
    // We decode the same bytes we already verified, so no TOCTOU.
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(feedBytes));
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const parsed = UpdateFeedSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", message: "feed JSON failed validation" };
    }

    if (compareVersions(parsed.data.version, currentVersion) > 0) {
      return {
        status: "available",
        current: currentVersion,
        latest: parsed.data,
      };
    }
    return { status: "up-to-date", current: currentVersion };
  }
}

/**
 * Three-way version compare for `MAJOR.MINOR.PATCH` strings.
 * Returns negative/zero/positive consistent with `Array.sort`.
 */
export function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = a.split(".").map(Number);
  const [bMaj, bMin, bPatch] = b.split(".").map(Number);
  if ((aMaj ?? 0) !== (bMaj ?? 0)) return (aMaj ?? 0) - (bMaj ?? 0);
  if ((aMin ?? 0) !== (bMin ?? 0)) return (aMin ?? 0) - (bMin ?? 0);
  return (aPatch ?? 0) - (bPatch ?? 0);
}
