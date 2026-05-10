import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareVersions, UpdateServiceImpl } from "../update-service.js";

const FEED_URL_ENV = "PRAXIS_UPDATE_FEED_URL";

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("returns positive when a > b across each segment", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.5", "1.0.4")).toBeGreaterThan(0);
  });

  it("returns negative when a < b across each segment", () => {
    expect(compareVersions("1.9.9", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("1.1.9", "1.2.0")).toBeLessThan(0);
    expect(compareVersions("1.0.4", "1.0.5")).toBeLessThan(0);
  });
});

describe("UpdateServiceImpl.checkLatest", () => {
  // biome-ignore lint/suspicious/noExplicitAny: deps not used by update service in tests
  const fakeDeps = {} as any;
  const originalFeedUrl = process.env[FEED_URL_ENV];
  let fetchSpy: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    if (originalFeedUrl === undefined) {
      delete process.env[FEED_URL_ENV];
    } else {
      process.env[FEED_URL_ENV] = originalFeedUrl;
    }
    globalThis.fetch = originalFetch;
  });

  it("returns disabled when env var unset", async () => {
    delete process.env[FEED_URL_ENV];
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("disabled");
  });

  it("returns available when feed version > current", async () => {
    process.env[FEED_URL_ENV] = "https://example.com/feed.json";
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: "1.0.1",
        downloadUrl: "https://example.com/Praxis-1.0.1.dmg",
      }),
    });
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("available");
    if (r.status === "available") {
      expect(r.current).toBe("1.0.0");
      expect(r.latest.version).toBe("1.0.1");
      expect(r.latest.downloadUrl).toBe("https://example.com/Praxis-1.0.1.dmg");
    }
  });

  it("returns up-to-date when feed version equals current", async () => {
    process.env[FEED_URL_ENV] = "https://example.com/feed.json";
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: "1.0.0",
        downloadUrl: "https://example.com/Praxis-1.0.0.dmg",
      }),
    });
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("up-to-date");
  });

  it("returns up-to-date when feed version is older", async () => {
    process.env[FEED_URL_ENV] = "https://example.com/feed.json";
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: "0.9.0",
        downloadUrl: "https://example.com/Praxis-0.9.0.dmg",
      }),
    });
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("up-to-date");
  });

  it("returns error on HTTP non-2xx", async () => {
    process.env[FEED_URL_ENV] = "https://example.com/feed.json";
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("503");
  });

  it("returns error on network failure", async () => {
    process.env[FEED_URL_ENV] = "https://example.com/feed.json";
    fetchSpy.mockRejectedValueOnce(new Error("ENOTFOUND"));
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("ENOTFOUND");
  });

  it("returns error on schema mismatch", async () => {
    process.env[FEED_URL_ENV] = "https://example.com/feed.json";
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "not-semver", downloadUrl: "not-a-url" }),
    });
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("validation");
  });

describe("compareVersions edge inputs", () => {
  it("treats missing patch segment as 0 (1.0 == 1.0.0)", () => {
    // split(".")+map(Number) yields [1, 0, undefined]; aPatch ?? 0 = 0.
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });

  it("returns NaN for prerelease suffix (Number('0-beta') = NaN, not coerced to 0)", () => {
    // '1.0.0-beta'.split('.') = ['1','0','0-beta']; Number('0-beta') = NaN.
    // NaN ?? 0 returns NaN (not 0) because ?? only catches null/undefined.
    // The current implementation therefore returns NaN — not negative, not zero.
    // This test pins that behavior so a future change to reject or coerce
    // prerelease suffixes in compareVersions is noticed.
    const result = compareVersions("1.0.0-beta", "1.0.0");
    expect(Number.isNaN(result)).toBe(true);
  });
});

describe("checkLatest with feed containing prerelease tags", () => {
  // Restore globalThis.fetch between tests in this describe block.
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects 1.0.0-beta via schema (regex requires d+.d+.d+)", async () => {
    process.env[FEED_URL_ENV] = "https://example.com/feed.json";
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: "1.0.0-beta",
        downloadUrl: "https://example.com/Praxis-1.0.0-beta.dmg",
      }),
    });
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    // The schema regex /^\d+\.\d+\.\d+$/ rejects "1.0.0-beta" because of the suffix.
    expect(r.status).toBe("error");
    if (r.status === "error") {
      expect(r.message).toContain("validation");
    }
    delete process.env[FEED_URL_ENV];
  });
});

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["file:", "file:///etc/passwd"],
  ])("returns error when downloadUrl uses %s scheme", async (_scheme, dangerousUrl) => {
    process.env[FEED_URL_ENV] = "https://example.com/feed.json";
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: "1.0.1",
        downloadUrl: dangerousUrl,
      }),
    });
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    // Schema refine must reject non-http(s) schemes — never throw, always error status
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("validation");
  });
});
