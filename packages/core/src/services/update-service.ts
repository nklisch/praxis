import { z } from "zod";
import type { ServiceDeps } from "./types.js";

const FEED_URL_ENV = "PRAXIS_UPDATE_FEED_URL";

export const UpdateFeedSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver"),
  releaseDate: z.string().datetime().optional(),
  // Defensive URL allowlist: only http/https. Refuse javascript:, data:, file:,
  // etc. to prevent a compromised feed from delivering a click-targeted injection
  // into the renderer. Mirrors the same allowlist that praxis.shell.openExternal
  // enforces in ipc-server.ts.
  downloadUrl: z.url().refine((u) => /^https?:\/\//i.test(u), "downloadUrl must be http(s)"),
  releaseNotesUrl: z
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "releaseNotesUrl must be http(s)")
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
   * env var is set; otherwise fetches the feed JSON, validates it, compares
   * against `currentVersion`, and reports the outcome. Never throws —
   * callers receive a typed result with an explicit error variant.
   */
  checkLatest(currentVersion: string): Promise<UpdateCheckResult>;
}

export class UpdateServiceImpl implements UpdateService {
  // ServiceDeps reserved for future use (e.g., logger, persisted dismissal state).
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: reserved for future logger / config use
  constructor(private readonly _deps: ServiceDeps) {}

  async checkLatest(currentVersion: string): Promise<UpdateCheckResult> {
    const url = process.env[FEED_URL_ENV];
    if (!url) return { status: "disabled" };

    let raw: unknown;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Praxis-update-check" },
      });
      if (!res.ok) {
        return { status: "error", message: `HTTP ${res.status}` };
      }
      raw = await res.json();
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
