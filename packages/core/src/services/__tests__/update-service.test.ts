import { createPrivateKey, sign as cryptoSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { compareVersions, UpdateServiceImpl } from "../update-service.js";

const FEED_URL_ENV = "PRAXIS_UPDATE_FEED_URL";

// ---------------------------------------------------------------------------
// Module-level mock state — the mock factory captures this by reference so
// tests can mutate it to switch between the "key configured" and "no key"
// states without re-importing the module.
// ---------------------------------------------------------------------------
let mockIsConfigured = true;
let mockCryptoKey: CryptoKey | null = null;

vi.mock("../update-feed-public-key.js", () => ({
  UPDATE_FEED_PUBLIC_KEY_BASE64: "test-placeholder",
  isPublicKeyConfigured: () => mockIsConfigured,
  importUpdateFeedPublicKey: async () => {
    if (!mockCryptoKey) throw new Error("no key configured");
    return mockCryptoKey;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock fetch response that returns ArrayBuffer data. */
function mockArrayBufferResponse(data: Buffer) {
  return {
    ok: true,
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  };
}

/** Build a mock fetch response for the .sig file (text). */
function mockTextResponse(text: string, ok = true, status = 200) {
  return { ok, status, text: async () => text };
}

/** Build a mock fetch response that is not-ok (HTTP error). */
function mockErrorResponse(status: number) {
  return { ok: false, status };
}

// ---------------------------------------------------------------------------
// compareVersions (no changes — these still pass)
// ---------------------------------------------------------------------------

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

  describe("edge inputs", () => {
    it("treats missing patch segment as 0 (1.0 == 1.0.0)", () => {
      expect(compareVersions("1.0", "1.0.0")).toBe(0);
    });

    it("returns NaN for prerelease suffix (Number('0-beta') = NaN, not coerced to 0)", () => {
      const result = compareVersions("1.0.0-beta", "1.0.0");
      expect(Number.isNaN(result)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// UpdateServiceImpl.checkLatest — with signature verification
// ---------------------------------------------------------------------------

describe("UpdateServiceImpl.checkLatest", () => {
  let privateKeyPem: string;
  let fetchSpy: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;
  const originalFeedUrl = process.env[FEED_URL_ENV];

  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  // biome-ignore lint/suspicious/noExplicitAny: ServiceDeps only needs log for these tests
  const fakeDeps = { log } as any;

  const FEED_URL = "https://example.com/feed.json";
  const VALID_FEED = JSON.stringify({
    version: "1.0.1",
    downloadUrl: "https://example.com/Praxis-1.0.1.dmg",
  });

  /** Sign feedBytes with the test private key; returns base64. */
  function signFeed(feedBytes: Buffer): string {
    const privKey = createPrivateKey({ key: privateKeyPem, format: "pem" });
    const sig = cryptoSign(null, feedBytes, privKey);
    return sig.toString("base64");
  }

  beforeAll(async () => {
    // Generate a real Ed25519 keypair for the test suite.
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

    // Extract raw 32-byte public key from SPKI DER and import as CryptoKey.
    const spkiDer = publicKey.export({ type: "spki", format: "der" });
    const rawPub = spkiDer.subarray(spkiDer.length - 32);
    mockCryptoKey = await crypto.subtle.importKey("raw", rawPub, { name: "Ed25519" }, false, [
      "verify",
    ]);
  });

  beforeEach(() => {
    log.debug.mockReset();
    log.warn.mockReset();
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    process.env[FEED_URL_ENV] = FEED_URL;
    mockIsConfigured = true;
  });

  afterEach(() => {
    if (originalFeedUrl === undefined) {
      delete process.env[FEED_URL_ENV];
    } else {
      process.env[FEED_URL_ENV] = originalFeedUrl;
    }
    globalThis.fetch = originalFetch;
    mockIsConfigured = true;
  });

  it("returns disabled when env var is unset", async () => {
    delete process.env[FEED_URL_ENV];
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns disabled (no fetch) when public key is empty placeholder", async () => {
    mockIsConfigured = false;
    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns available when feed version > current and signature is valid", async () => {
    const feedBytes = Buffer.from(VALID_FEED, "utf8");
    const sigBase64 = signFeed(feedBytes);

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(sigBase64));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("available");
    if (r.status === "available") {
      expect(r.current).toBe("1.0.0");
      expect(r.latest.version).toBe("1.0.1");
      expect(r.latest.downloadUrl).toBe("https://example.com/Praxis-1.0.1.dmg");
    }
  });

  it("returns up-to-date when feed version equals current and signature is valid", async () => {
    const equalFeed = JSON.stringify({
      version: "1.0.0",
      downloadUrl: "https://example.com/Praxis-1.0.0.dmg",
    });
    const feedBytes = Buffer.from(equalFeed, "utf8");
    const sigBase64 = signFeed(feedBytes);

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(sigBase64));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("up-to-date");
  });

  it("returns up-to-date when feed version is older and signature is valid", async () => {
    const olderFeed = JSON.stringify({
      version: "0.9.0",
      downloadUrl: "https://example.com/Praxis-0.9.0.dmg",
    });
    const feedBytes = Buffer.from(olderFeed, "utf8");
    const sigBase64 = signFeed(feedBytes);

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(sigBase64));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("up-to-date");
  });

  it("returns error on HTTP non-2xx for the feed fetch", async () => {
    fetchSpy.mockResolvedValueOnce(mockErrorResponse(503));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("503");
  });

  it("returns error on network failure for the feed fetch", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ENOTFOUND"));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("ENOTFOUND");
  });

  it("returns error when sig fetch returns 404", async () => {
    const feedBytes = Buffer.from(VALID_FEED, "utf8");
    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockErrorResponse(404));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") {
      expect(r.message).toBe("signature fetch failed: HTTP 404");
    }
    expect(log.warn).toHaveBeenCalledWith(
      "update-service.sig_fetch_failed",
      expect.objectContaining({ status: 404 }),
    );
  });

  it("returns error when signature is malformed (wrong byte length)", async () => {
    const feedBytes = Buffer.from(VALID_FEED, "utf8");
    // 60 bytes of signature instead of the required 64.
    const shortSig = Buffer.alloc(60, 0x42).toString("base64");
    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(shortSig));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toBe("signature malformed");
    expect(log.warn).toHaveBeenCalledWith(
      "update-service.sig_malformed",
      expect.objectContaining({ expected: 64, got: 60 }),
    );
  });

  it("returns error when feed bytes are tampered after signing", async () => {
    const feedBytes = Buffer.from(VALID_FEED, "utf8");
    const sigBase64 = signFeed(feedBytes);

    // Tamper: flip one byte in the middle of the feed.
    const tamperedBytes = Buffer.from(feedBytes);
    tamperedBytes.writeUInt8((tamperedBytes[10] ?? 0) ^ 0xff, 10);

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(tamperedBytes))
      .mockResolvedValueOnce(mockTextResponse(sigBase64));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toBe("signature verification failed");
    expect(log.warn).toHaveBeenCalledWith(
      "update-service.sig_invalid",
      expect.objectContaining({ feedUrl: FEED_URL }),
    );
  });

  it("returns error when signature is made with a different key", async () => {
    // Generate a second keypair; sign with key B but the service is configured with key A.
    const { privateKey: altPrivKey } = generateKeyPairSync("ed25519");
    const altPrivPem = altPrivKey.export({ type: "pkcs8", format: "pem" }) as string;

    const feedBytes = Buffer.from(VALID_FEED, "utf8");
    const altPrivKeyObj = createPrivateKey({ key: altPrivPem, format: "pem" });
    const wrongSig = cryptoSign(null, feedBytes, altPrivKeyObj).toString("base64");

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(wrongSig));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toBe("signature verification failed");
  });

  it("returns error on schema mismatch after valid signature", async () => {
    const badFeed = JSON.stringify({ version: "not-semver", downloadUrl: "not-a-url" });
    const feedBytes = Buffer.from(badFeed, "utf8");
    const sigBase64 = signFeed(feedBytes);

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(sigBase64));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("validation");
  });

  it("rejects feed with 1.0.0-beta version via schema (regex requires d+.d+.d+)", async () => {
    const betaFeed = JSON.stringify({
      version: "1.0.0-beta",
      downloadUrl: "https://example.com/Praxis-1.0.0-beta.dmg",
    });
    const feedBytes = Buffer.from(betaFeed, "utf8");
    const sigBase64 = signFeed(feedBytes);

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(sigBase64));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("validation");
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["file:", "file:///etc/passwd"],
  ])("returns error when downloadUrl uses %s scheme (after valid signature)", async (_scheme, dangerousUrl) => {
    const dangerousFeed = JSON.stringify({
      version: "1.0.1",
      downloadUrl: dangerousUrl,
    });
    const feedBytes = Buffer.from(dangerousFeed, "utf8");
    const sigBase64 = signFeed(feedBytes);

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(sigBase64));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("validation");
  });

  it("accepts feed with installerSha256 and surfaces it in the result", async () => {
    const feedWithHash = JSON.stringify({
      version: "1.0.1",
      downloadUrl: "https://example.com/Praxis-1.0.1.dmg",
      installerSha256: "a".repeat(64),
    });
    const feedBytes = Buffer.from(feedWithHash, "utf8");
    const sigBase64 = signFeed(feedBytes);

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(sigBase64));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("available");
    if (r.status === "available") {
      expect(r.latest.installerSha256).toBe("a".repeat(64));
    }
  });

  it("rejects installerSha256 with uppercase hex via schema", async () => {
    const feedWithUpperHash = JSON.stringify({
      version: "1.0.1",
      downloadUrl: "https://example.com/Praxis-1.0.1.dmg",
      installerSha256: "A".repeat(64), // uppercase — should fail schema
    });
    const feedBytes = Buffer.from(feedWithUpperHash, "utf8");
    const sigBase64 = signFeed(feedBytes);

    fetchSpy
      .mockResolvedValueOnce(mockArrayBufferResponse(feedBytes))
      .mockResolvedValueOnce(mockTextResponse(sigBase64));

    const svc = new UpdateServiceImpl(fakeDeps);
    const r = await svc.checkLatest("1.0.0");
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toContain("validation");
  });

  describe("compareVersions edge inputs (pinned behavior)", () => {
    it("treats missing patch segment as 0 (1.0 == 1.0.0)", () => {
      expect(compareVersions("1.0", "1.0.0")).toBe(0);
    });

    it("returns NaN for prerelease suffix (Number('0-beta') = NaN, not coerced to 0)", () => {
      const result = compareVersions("1.0.0-beta", "1.0.0");
      expect(Number.isNaN(result)).toBe(true);
    });
  });
});
